<template>
  <div class="board-wrap">
    <div ref="boardRef" class="board">
      <div class="columns" :style="{ '--card-w': cardWidthPx + 'px' }">
        <div
          v-for="(column, colIndex) in columns"
          :key="colIndex"
          class="column"
          :class="columnClasses(colIndex)"
          :style="{ height: columnHeight(colIndex) + 'px' }"
          :data-column="colIndex"
          :ref="(el) => setColumnEl(el, colIndex)"
          @click="onColumnClick($event, colIndex)"
        >
          <div v-if="column.length === 0" class="empty-slot"></div>
          <div
            v-for="item in layouts[colIndex]?.items ?? []"
            :key="item.card.id"
            class="play-card"
            :class="cardClasses(colIndex, item)"
            :style="{ top: item.top + 'px', zIndex: item.index + 1 }"
            @pointerdown="onCardPointerDown($event, colIndex, item.index)"
            @dblclick="onCardDoubleClick(colIndex, item.index)"
          >
            <CardView :card="item.card" />
          </div>
        </div>
      </div>
    </div>

    <!-- 拖动层：跟随指针渲染被拖动的牌组 -->
    <Teleport to="body">
      <div v-if="drag?.active && drag.run" class="drag-layer" :style="dragLayerStyle">
        <div
          v-for="(card, k) in drag.run"
          :key="card.id"
          class="drag-card"
          :style="{ top: dragTops[k] + 'px' }"
        >
          <CardView :card="card" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Card, CardMove } from '@/types';
import { canDropOn, getMovableRun } from '@/core/rules';
import CardView from './CardView.vue';

const props = defineProps<{
  columns: Card[][];
  /** 提示高亮的移动（null 表示无提示） */
  hintMove: CardMove | null;
  /** 胜利后锁定操作 */
  disabled: boolean;
}>();

const emit = defineEmits<{
  (event: 'move', from: number, index: number, to: number): void;
  (event: 'auto-move', from: number, index: number): void;
}>();

/** 正面牌之间的堆叠偏移系数（相对卡牌高度） */
const FACE_UP_GAP = 0.3;
/** 背面牌之间的堆叠偏移系数 */
const FACE_DOWN_GAP = 0.13;
/** 拖动判定阈值（px），小于该位移视为点击 */
const DRAG_THRESHOLD = 6;

interface LayoutItem {
  card: Card;
  index: number;
  top: number;
}

interface ColumnLayout {
  items: LayoutItem[];
  height: number;
}

interface Range {
  from: number;
  start: number;
  end: number;
}

interface DragState {
  from: number;
  index: number;
  /** 可整体移动的牌组；点击到背面牌为 null */
  run: Card[] | null;
  pointerX: number;
  pointerY: number;
  grabX: number;
  grabY: number;
  /** 位移超过阈值后才真正进入拖动状态 */
  active: boolean;
}

const boardRef = ref<HTMLElement | null>(null);
const cardWidthPx = ref(80);
const cardHeightPx = ref(112);
const viewportHeight = ref(window.innerHeight);

const drag = ref<DragState | null>(null);
const hoverColumn = ref<number | null>(null);
const selection = ref<{ from: number; index: number } | null>(null);
const shakeColumn = ref<number | null>(null);
let shakeTimer: number | null = null;

const columnEls: Array<HTMLElement | null> = [];

function setColumnEl(el: unknown, col: number): void {
  columnEls[col] = el instanceof HTMLElement ? el : null;
}

// ---------- 尺寸测量（卡牌实际像素尺寸驱动堆叠布局与拖动层） ----------
function measureCards(): void {
  viewportHeight.value = window.innerHeight;
  const el = boardRef.value?.querySelector('.play-card');
  if (el instanceof HTMLElement) {
    const rect = el.getBoundingClientRect();
    if (rect.height > 20 && rect.width > 10) {
      cardHeightPx.value = rect.height;
      cardWidthPx.value = rect.width;
      return;
    }
  }
  // 兜底（jsdom 无布局 / 牌桌为空时）
  const width = Math.min(92, Math.max(44, window.innerWidth / 12));
  cardWidthPx.value = width;
  cardHeightPx.value = width * 1.4;
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  measureCards();
  window.addEventListener('resize', measureCards);
  if (typeof ResizeObserver !== 'undefined' && boardRef.value) {
    resizeObserver = new ResizeObserver(measureCards);
    resizeObserver.observe(boardRef.value);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', measureCards);
  resizeObserver?.disconnect();
  resizeObserver = null;
  stopDragListeners();
  if (shakeTimer !== null) {
    window.clearTimeout(shakeTimer);
  }
});

// ---------- 堆叠布局：超长列按比例压缩间距，尽量完整展示 ----------
const maxColumnHeight = computed(() => {
  const boardTop = boardRef.value?.getBoundingClientRect().top ?? 200;
  return Math.max(260, viewportHeight.value - boardTop - 64);
});

const layouts = computed<ColumnLayout[]>(() => {
  const h = cardHeightPx.value;
  const maxHeight = maxColumnHeight.value;
  return props.columns.map((column) => {
    let gapTotal = 0;
    for (let i = 0; i < column.length - 1; i++) {
      gapTotal += column[i]!.faceUp ? FACE_UP_GAP : FACE_DOWN_GAP;
    }
    gapTotal *= h;
    const scale =
      gapTotal + h > maxHeight && gapTotal > 0 ? Math.max(0.24, (maxHeight - h) / gapTotal) : 1;
    const items: LayoutItem[] = [];
    let top = 0;
    column.forEach((card, index) => {
      items.push({ card, index, top });
      top += (card.faceUp ? FACE_UP_GAP : FACE_DOWN_GAP) * h * scale;
    });
    const last = items[items.length - 1];
    return { items, height: last ? last.top + h : h };
  });
});

function columnHeight(colIndex: number): number {
  return layouts.value[colIndex]?.height ?? cardHeightPx.value;
}

// ---------- 提示 / 选中 / 拖动范围 ----------
const hintRange = computed<Range | null>(() => {
  const hint = props.hintMove;
  if (!hint) {
    return null;
  }
  const column = props.columns[hint.from];
  const run = column ? getMovableRun(column, hint.index) : null;
  if (!run) {
    return null;
  }
  return { from: hint.from, start: hint.index, end: hint.index + run.length - 1 };
});

const selectionRange = computed<Range | null>(() => {
  const sel = selection.value;
  if (!sel) {
    return null;
  }
  const column = props.columns[sel.from];
  const run = column ? getMovableRun(column, sel.index) : null;
  if (!run) {
    return null;
  }
  return { from: sel.from, start: sel.index, end: sel.index + run.length - 1 };
});

const hiddenRange = computed<Range | null>(() => {
  const d = drag.value;
  if (!d?.active || !d.run) {
    return null;
  }
  return { from: d.from, start: d.index, end: d.index + d.run.length - 1 };
});

function inRange(range: Range | null, colIndex: number, index: number): boolean {
  return !!range && range.from === colIndex && index >= range.start && index <= range.end;
}

function cardClasses(colIndex: number, item: LayoutItem): Record<string, boolean> {
  return {
    'is-selected': inRange(selectionRange.value, colIndex, item.index),
    'is-hinted': inRange(hintRange.value, colIndex, item.index),
    'is-hidden': inRange(hiddenRange.value, colIndex, item.index)
  };
}

function columnClasses(colIndex: number): Record<string, boolean> {
  const d = drag.value;
  const hovered = !!d?.active && hoverColumn.value === colIndex && hoverColumn.value !== d.from;
  return {
    'is-empty': props.columns[colIndex]?.length === 0,
    'drop-target': hovered && isDropOk(colIndex),
    'drop-reject': hovered && !isDropOk(colIndex),
    'hint-target': props.hintMove?.to === colIndex && hintRange.value !== null,
    shake: shakeColumn.value === colIndex
  };
}

function isDropOk(colIndex: number): boolean {
  const d = drag.value;
  if (!d) {
    return false;
  }
  const target = props.columns[colIndex];
  return !!d.run && !!target && canDropOn(target[target.length - 1], d.run);
}

function triggerShake(colIndex: number): void {
  if (shakeTimer !== null) {
    window.clearTimeout(shakeTimer);
  }
  shakeColumn.value = colIndex;
  shakeTimer = window.setTimeout(() => {
    shakeColumn.value = null;
    shakeTimer = null;
  }, 420);
}

// ---------- 拖动层位置 ----------
const dragTops = computed<number[]>(() => {
  const d = drag.value;
  if (!d) {
    return [];
  }
  const items = layouts.value[d.from]?.items ?? [];
  const base = items[d.index]?.top ?? 0;
  return d.run?.map((_, k) => (items[d.index + k]?.top ?? base) - base) ?? [];
});

const dragLayerStyle = computed(() => {
  const d = drag.value;
  if (!d) {
    return {};
  }
  return {
    left: `${d.pointerX - d.grabX}px`,
    top: `${d.pointerY - d.grabY}px`,
    width: `${cardWidthPx.value}px`,
    '--card-w': `${cardWidthPx.value}px`
  };
});

// ---------- 指针交互 ----------
function onCardPointerDown(event: PointerEvent, from: number, index: number): void {
  if (props.disabled) {
    return;
  }
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return;
  }
  event.preventDefault();
  const column = props.columns[from];
  const run = column ? getMovableRun(column, index) : null;
  const element = event.currentTarget as HTMLElement;
  const rect = element.getBoundingClientRect();
  drag.value = {
    from,
    index,
    run,
    pointerX: event.clientX,
    pointerY: event.clientY,
    grabX: event.clientX - rect.left,
    grabY: event.clientY - rect.top,
    active: false
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
}

function stopDragListeners(): void {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerCancel);
}

function onPointerMove(event: PointerEvent): void {
  const d = drag.value;
  if (!d) {
    return;
  }
  if (!d.active) {
    const moved = Math.hypot(event.clientX - d.pointerX, event.clientY - d.pointerY);
    if (moved < DRAG_THRESHOLD) {
      return;
    }
    if (!d.run) {
      // 背面牌不可拖动，直接放弃
      cancelDrag();
      return;
    }
    d.active = true;
    selection.value = null;
  }
  d.pointerX = event.clientX;
  d.pointerY = event.clientY;
  hoverColumn.value = columnAtX(event.clientX);
}

function onPointerUp(event: PointerEvent): void {
  const d = drag.value;
  stopDragListeners();
  if (!d) {
    return;
  }
  if (d.active && d.run) {
    const target = columnAtX(event.clientX);
    const from = d.from;
    const index = d.index;
    drag.value = null;
    hoverColumn.value = null;
    if (target !== null && target !== from) {
      attemptMove(from, index, target);
    }
    return;
  }
  drag.value = null;
  hoverColumn.value = null;
  if (d.run) {
    handleCardClick(d.from, d.index);
  } else {
    handleColumnBackgroundClick(d.from);
  }
}

function onPointerCancel(): void {
  cancelDrag();
}

function cancelDrag(): void {
  stopDragListeners();
  drag.value = null;
  hoverColumn.value = null;
}

/** 指针 x 坐标命中的列（按列中心距离取最近一列，超出牌桌一定范围视为取消） */
function columnAtX(x: number): number | null {
  const board = boardRef.value;
  if (!board) {
    return null;
  }
  const boardRect = board.getBoundingClientRect();
  if (x < boardRect.left - 80 || x > boardRect.right + 80) {
    return null;
  }
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  columnEls.forEach((element, index) => {
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    const distance = Math.abs(rect.left + rect.width / 2 - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/** 尝试把 from 列 index 起的牌组移到 to 列；非法时目标列抖动提示 */
function attemptMove(from: number, index: number, to: number): boolean {
  const source = props.columns[from];
  const target = props.columns[to];
  if (!source || !target) {
    return false;
  }
  const run = getMovableRun(source, index);
  if (!run || !canDropOn(target[target.length - 1], run)) {
    triggerShake(to);
    return false;
  }
  selection.value = null;
  emit('move', from, index, to);
  return true;
}

/** 卡牌点击（未发生拖动）：有选中时尝试移动，否则选中/取消选中 */
function handleCardClick(from: number, index: number): void {
  const sel = selection.value;
  if (sel) {
    if (sel.from === from && sel.index === index) {
      selection.value = null;
      return;
    }
    if (sel.from !== from && attemptMove(sel.from, sel.index, from)) {
      return;
    }
  }
  const column = props.columns[from];
  const run = column ? getMovableRun(column, index) : null;
  selection.value = run ? { from, index } : null;
}

/** 点击列空白区域：有选中时尝试移入该列 */
function handleColumnBackgroundClick(col: number): void {
  const sel = selection.value;
  if (!sel) {
    return;
  }
  if (sel.from === col) {
    selection.value = null;
    return;
  }
  attemptMove(sel.from, sel.index, col);
}

function onColumnClick(event: MouseEvent, col: number): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest('.play-card')) {
    // 卡牌点击在 pointerup 中处理，避免重复触发
    return;
  }
  handleColumnBackgroundClick(col);
}

function onCardDoubleClick(from: number, index: number): void {
  if (props.disabled) {
    return;
  }
  selection.value = null;
  emit('auto-move', from, index);
}
</script>

<style scoped lang="less">
.board-wrap {
  display: flex;
  justify-content: center;
  padding: 0 16px 20px;
}

.board {
  width: 100%;
  max-width: 1220px;
  padding: 16px 14px 22px;
  border-radius: 18px;
  background:
    radial-gradient(120% 90% at 50% 0%, var(--color-felt-sheen), transparent 60%),
    linear-gradient(165deg, var(--color-felt-start), var(--color-felt-end));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -14px 40px var(--color-felt-edge),
    0 10px 28px var(--color-shadow-card);
}

.columns {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: min(0.85vw, 10px);
}

.column {
  position: relative;
  min-height: 40px;

  &.is-empty::after {
    /* 空列提示底色 */
    content: '';
    position: absolute;
    inset: 0;
    border-radius: calc(var(--card-w, 80px) * 0.09);
    background: rgba(255, 255, 255, 0.06);
  }

  &.shake {
    animation: shake 0.4s ease;
  }

  &.drop-target::before,
  &.hint-target::before {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: calc(var(--card-w, 80px) * 0.14);
    pointer-events: none;
    z-index: 0;
  }

  &.drop-target::before {
    background: color-mix(in srgb, var(--color-drop-ok) 26%, transparent);
    box-shadow: 0 0 0 2px var(--color-drop-ok);
  }

  &.drop-reject::before {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: calc(var(--card-w, 80px) * 0.14);
    pointer-events: none;
    background: color-mix(in srgb, var(--color-drop-bad) 22%, transparent);
    box-shadow: 0 0 0 2px var(--color-drop-bad);
  }

  &.hint-target::before {
    background: color-mix(in srgb, var(--color-drop-ok) 20%, transparent);
    box-shadow: 0 0 0 2px var(--color-drop-ok);
    animation: hint-pulse 1.4s ease-in-out infinite;
  }
}

.empty-slot {
  width: 100%;
  aspect-ratio: 5 / 7;
  border-radius: calc(var(--card-w, 80px) * 0.09);
  border: 2px dashed var(--color-empty-slot);
}

.play-card {
  position: absolute;
  left: 0;
  right: 0;
  cursor: grab;
  touch-action: none;

  &:hover {
    filter: brightness(1.04);
  }

  &.is-selected {
    transform: translateY(-6px);

    :deep(.card) {
      box-shadow:
        0 0 0 2px var(--color-drop-ok),
        0 6px 14px var(--color-shadow-card);
    }
  }

  &.is-hinted {
    transform: translateY(-6px);

    :deep(.card) {
      box-shadow:
        0 0 0 3px var(--color-drop-ok),
        0 6px 16px var(--color-shadow-card);
      animation: card-glow 1.2s ease-in-out infinite;
    }
  }

  &.is-hidden {
    visibility: hidden;
  }
}

.drag-layer {
  position: fixed;
  z-index: 1000;
  pointer-events: none;

  .drag-card {
    position: absolute;
    left: 0;
    width: 100%;
    transform: rotate(1.6deg) scale(1.03);
    transform-origin: 30% 30%;

    :deep(.card) {
      box-shadow:
        0 10px 24px rgba(0, 0, 0, 0.4),
        0 2px 6px rgba(0, 0, 0, 0.3);
    }
  }
}

.drag-card + .drag-card {
  /* 保持拖动组的紧凑叠放观感 */
  filter: brightness(0.99);
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px);
  }
  50% {
    transform: translateX(4px);
  }
  75% {
    transform: translateX(-2px);
  }
}

@keyframes hint-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

@keyframes card-glow {
  0%,
  100% {
    filter: brightness(1.05);
  }
  50% {
    filter: brightness(1.18);
  }
}

@media (max-width: 860px) {
  .board-wrap {
    justify-content: flex-start;
    overflow-x: auto;
  }

  .board {
    min-width: 760px;
  }
}
</style>
