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
        >
          <div v-if="column.length === 0" class="empty-slot"></div>
          <div
            v-for="item in layouts[colIndex]?.items ?? []"
            :key="item.card.id"
            class="play-card"
            :data-card-id="item.card.id"
            :class="cardClasses(colIndex, item)"
            :style="{ top: item.top + 'px', zIndex: item.index + 1 }"
            @pointerdown="onCardPointerDown($event, colIndex, item.index)"
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

    <!-- 飞行动画层：收牌飞向完成槽、发牌从牌堆飞出 -->
    <Teleport to="body">
      <div
        v-if="flights.length > 0"
        class="flight-layer"
        :style="{ '--card-w': cardWidthPx + 'px' }"
      >
        <div
          v-for="item in flights"
          :key="item.key"
          class="flight-card"
          :style="{ left: item.left + 'px', top: item.top + 'px', width: cardWidthPx + 'px' }"
          :ref="(el) => registerFlight(el, item)"
        >
          <CardView :card="item.card" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue';
import type { Card, CardMove } from '@/types';
import { findAutoMove } from '@/core/engine';
import { canDropOn, getMovableRun } from '@/core/rules';
import CardView from './CardView.vue';

const props = defineProps<{
  columns: Card[][];
  /** 提示高亮的移动（null 表示无提示） */
  hintMove: CardMove | null;
  /** 胜利后锁定操作 */
  disabled: boolean;
  /** 最近一次操作的类型（驱动入场/发牌/收牌动画编排） */
  action?: 'new' | 'deal' | 'move' | 'undo';
  /** 当前已完成组数（收牌飞行的目标槽位） */
  completedCount?: number;
}>();

const emit = defineEmits<{
  (event: 'move', from: number, index: number, to: number): void;
}>();

/** 正面牌之间的堆叠偏移系数（相对卡牌高度） */
const FACE_UP_GAP = 0.3;
/** 背面牌之间的堆叠偏移系数 */
const FACE_DOWN_GAP = 0.13;
/** 拖动判定阈值（px），小于该位移视为单击 */
const DRAG_THRESHOLD = 8;

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
/** 牌桌内区实际高度（画布尺寸驱动堆叠压缩，保证加牌后画布不变形） */
const boardInnerHeight = ref(0);

const drag = ref<DragState | null>(null);
const hoverColumn = ref<number | null>(null);
const shakeColumn = ref<number | null>(null);
let shakeTimer: number | null = null;

const columnEls: Array<HTMLElement | null> = [];

function setColumnEl(el: unknown, col: number): void {
  columnEls[col] = el instanceof HTMLElement ? el : null;
}

// ---------- 尺寸测量（画布与卡牌实际像素尺寸驱动堆叠布局与拖动层） ----------
function measureCards(): void {
  viewportHeight.value = window.innerHeight;
  const board = boardRef.value;
  if (board) {
    const styles = window.getComputedStyle(board);
    const padTop = Number.parseFloat(styles.paddingTop) || 0;
    const padBottom = Number.parseFloat(styles.paddingBottom) || 0;
    boardInnerHeight.value = Math.max(0, board.clientHeight - padTop - padBottom);
  }
  const el = board?.querySelector('.play-card');
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
  // 首次进入游戏（牌桌首次挂载）时也播放发牌入场动画
  if (props.action === 'new') {
    animateBoardUpdate();
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
  flightTimers.forEach((timer) => window.clearTimeout(timer));
  flightTimers.length = 0;
});

// ---------- 堆叠布局：超长列按比例压缩间距，保证画布尺寸不变 ----------
const maxColumnHeight = computed(() => {
  const available = boardInnerHeight.value || viewportHeight.value - 260;
  return Math.max(cardHeightPx.value + 56, available);
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

// ---------- 提示 / 拖动范围 ----------
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

// ---------- 变更动画（FLIP 滑移 / 翻面 / 发牌与收牌飞行） ----------
/** 位置变化时的滑移动画时长（ms） */
const FLIP_DURATION = 260;
const FLIP_EASING = 'cubic-bezier(0.25, 0.72, 0.3, 1)';
/** 翻面动画时长（ms） */
const FLIP_FACE_DURATION = 280;
/** 收牌飞行时长（ms） */
const FLIGHT_DURATION = 560;

const WAAPI_ENABLED =
  typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

interface RectSnapshot {
  left: number;
  top: number;
}

interface BoardSnapshot {
  rects: Map<string, RectSnapshot>;
  cards: Map<string, Card>;
  face: Map<string, boolean>;
}

let prevSnapshot: BoardSnapshot = { rects: new Map(), cards: new Map(), face: new Map() };
/** 拖拽落点覆盖：松手后让牌从「指针处」而不是原位置开始飞 */
let pendingDragRects = new Map<string, RectSnapshot>();
/** 本组件最近一次更新是否由 columns 变化引起 */
let columnsChanged = false;

watch(
  () => props.columns,
  (_columns, oldColumns) => {
    const rects = new Map<string, RectSnapshot>();
    const cards = new Map<string, Card>();
    const face = new Map<string, boolean>();
    (oldColumns ?? []).forEach((column) =>
      column.forEach((card) => {
        cards.set(card.id, card);
        face.set(card.id, card.faceUp);
      })
    );
    boardRef.value?.querySelectorAll<HTMLElement>('.play-card[data-card-id]').forEach((el) => {
      const rect = el.getBoundingClientRect();
      rects.set(el.dataset.cardId!, { left: rect.left, top: rect.top });
    });
    pendingDragRects.forEach((rect, id) => rects.set(id, rect));
    pendingDragRects = new Map();
    prevSnapshot = { rects, cards, face };
    columnsChanged = true;
  },
  { flush: 'pre' }
);

onUpdated(() => {
  if (!columnsChanged) {
    return;
  }
  columnsChanged = false;
  animateBoardUpdate();
});

function cancelAnimations(el: HTMLElement): void {
  el.getAnimations().forEach((animation) => animation.cancel());
}

interface FlightItem {
  key: number;
  card: Card;
  left: number;
  top: number;
  dx: number;
  dy: number;
  delay: number;
}

const flights = ref<FlightItem[]>([]);
let flightSeq = 0;
const flightTimers: number[] = [];

/** 每次 columns 变化后：播放差分动画并刷新基线 */
function animateBoardUpdate(): void {
  const board = boardRef.value;
  const kind = props.action ?? 'move';
  const nowRects = new Map<string, RectSnapshot>();
  const nowEls = new Map<string, HTMLElement>();
  board?.querySelectorAll<HTMLElement>('.play-card[data-card-id]').forEach((el) => {
    const rect = el.getBoundingClientRect();
    nowRects.set(el.dataset.cardId!, { left: rect.left, top: rect.top });
    nowEls.set(el.dataset.cardId!, el);
  });

  if (WAAPI_ENABLED && !PREFERS_REDUCED_MOTION && board) {
    if (kind === 'new') {
      // 新开局：整桌按列错峰落位
      playDealInAnimation([...nowEls.entries()].map(([id, el]) => ({ id, el })));
    } else if (prevSnapshot.rects.size > 0) {
      playMoveAnimations(kind, nowRects, nowEls);
    }
  }

  const nowFace = new Map<string, boolean>();
  const nowCards = new Map<string, Card>();
  props.columns.forEach((column) =>
    column.forEach((card) => {
      nowFace.set(card.id, card.faceUp);
      nowCards.set(card.id, card);
    })
  );
  prevSnapshot = { rects: nowRects, cards: nowCards, face: nowFace };
}

/** 移动/撤销后的常规动画：滑移、翻面、发牌飞入、收牌飞出 */
function playMoveAnimations(
  kind: 'new' | 'deal' | 'move' | 'undo',
  nowRects: Map<string, RectSnapshot>,
  nowEls: Map<string, HTMLElement>
): void {
  const prev = prevSnapshot;

  // 1) 位置变化 → FLIP 滑移
  nowEls.forEach((el, id) => {
    const before = prev.rects.get(id);
    if (!before) {
      return;
    }
    const after = nowRects.get(id)!;
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      return;
    }
    cancelAnimations(el);
    el.classList.add('card-flying');
    const animation = el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
      { duration: FLIP_DURATION, easing: FLIP_EASING }
    );
    const cleanup = () => el.classList.remove('card-flying');
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  });

  // 2) 正反面变化 → 翻转
  props.columns.forEach((column) =>
    column.forEach((card) => {
      const before = prev.face.get(card.id);
      if (before === undefined || before === card.faceUp) {
        return;
      }
      const el = nowEls.get(card.id);
      if (!el) {
        return;
      }
      cancelAnimations(el);
      el.animate(
        [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.06)' }, { transform: 'scaleX(1)' }],
        { duration: FLIP_FACE_DURATION, easing: 'ease-in-out' }
      );
    })
  );

  // 3) 新出现的牌：发牌从牌堆飞出，其余（撤销恢复等）淡入
  const added: Array<{ id: string; el: HTMLElement }> = [];
  nowEls.forEach((el, id) => {
    if (!prev.rects.has(id)) {
      added.push({ id, el });
    }
  });
  if (added.length > 0) {
    if (kind === 'deal') {
      playStockFlight(added);
    } else {
      playFadeIn(added);
    }
  }

  // 4) 消失的牌：移动/发牌中消失即为收走的一组 K→A，飞向完成槽
  if (kind === 'move' || kind === 'deal') {
    const removed: Array<{ card: Card; rect: RectSnapshot }> = [];
    prev.rects.forEach((rect, id) => {
      if (nowRects.has(id)) {
        return;
      }
      const card = prev.cards.get(id);
      if (card) {
        removed.push({ card, rect });
      }
    });
    if (removed.length > 0) {
      spawnCollectFlights(removed);
    }
  }
}

/** 新开局的入场动画：按列从左到右错峰落下 */
function playDealInAnimation(added: Array<{ id: string; el: HTMLElement }>): void {
  const columnOf = new Map<string, number>();
  props.columns.forEach((column, col) => column.forEach((card) => columnOf.set(card.id, col)));
  added.forEach((entry) => {
    const col = columnOf.get(entry.id) ?? 0;
    entry.el.animate(
      [
        { transform: 'translateY(-26px)', opacity: 0 },
        { transform: 'translateY(0px)', opacity: 1 }
      ],
      { duration: 320, delay: col * 50, easing: 'ease-out', fill: 'backwards' }
    );
  });
}

/** 发牌动画：10 张牌从牌堆位置依次飞向各自列尾 */
function playStockFlight(added: Array<{ id: string; el: HTMLElement }>): void {
  const stockEl = document.querySelector<HTMLElement>('[data-testid="stock"]');
  if (!stockEl) {
    playFadeIn(added);
    return;
  }
  const stockRect = stockEl.getBoundingClientRect();
  added.forEach((entry, k) => {
    const target = entry.el.getBoundingClientRect();
    const dx = stockRect.left + stockRect.width / 2 - (target.left + target.width / 2);
    const dy = stockRect.top + stockRect.height / 2 - (target.top + target.height / 2);
    // 飞行途中浮到最上层（与滑移动画同一档 z-index: 80），避免被途经列的牌堆遮挡
    entry.el.classList.add('card-flying');
    const animation = entry.el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(-6deg)`, opacity: 0.6 },
        { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1 }
      ],
      {
        duration: 420,
        delay: k * 45,
        easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        fill: 'backwards'
      }
    );
    const cleanup = () => entry.el.classList.remove('card-flying');
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  });
}

/** 兜底入场：轻微上浮淡入（撤销恢复等） */
function playFadeIn(added: Array<{ id: string; el: HTMLElement }>): void {
  added.forEach((entry, k) => {
    entry.el.animate(
      [
        { transform: 'translateY(10px)', opacity: 0 },
        { transform: 'translateY(0px)', opacity: 1 }
      ],
      { duration: 240, delay: Math.min(k, 12) * 14, easing: 'ease-out', fill: 'backwards' }
    );
  });
}

/** 收牌动画：K→A 一组牌从原位置依次飞进完成槽 */
function spawnCollectFlights(removed: Array<{ card: Card; rect: RectSnapshot }>): void {
  const slots = document.querySelectorAll<HTMLElement>('.stat-completed .slot');
  if (slots.length === 0) {
    return;
  }
  const index = Math.min(Math.max((props.completedCount ?? slots.length) - 1, 0), slots.length - 1);
  const slot = slots[index];
  if (!slot) {
    return;
  }
  const slotRect = slot.getBoundingClientRect();
  const width = cardWidthPx.value;
  const height = cardHeightPx.value;
  const ordered = [...removed].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const keys: number[] = [];
  ordered.forEach((entry, k) => {
    const key = ++flightSeq;
    keys.push(key);
    flights.value.push({
      key,
      card: entry.card,
      left: entry.rect.left,
      top: entry.rect.top,
      dx: slotRect.left + slotRect.width / 2 - (entry.rect.left + width / 2),
      dy: slotRect.top + slotRect.height / 2 - (entry.rect.top + height / 2),
      delay: k * 45
    });
  });
  const cleanupAfter = ordered.length * 45 + FLIGHT_DURATION + 160;
  const timer = window.setTimeout(() => {
    const keySet = new Set(keys);
    flights.value = flights.value.filter((item) => !keySet.has(item.key));
  }, cleanupAfter);
  flightTimers.push(timer);
}

/** 飞行克隆挂载时启动动画（从原位置飞向目标并缩小淡出） */
function registerFlight(el: unknown, item: FlightItem): void {
  if (!(el instanceof HTMLElement) || !WAAPI_ENABLED || PREFERS_REDUCED_MOTION) {
    return;
  }
  el.animate(
    [
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
      {
        transform: `translate(${item.dx * 0.55}px, ${item.dy * 0.55}px) scale(0.97)`,
        opacity: 1,
        offset: 0.62
      },
      { transform: `translate(${item.dx}px, ${item.dy}px) scale(0.6)`, opacity: 0.15 }
    ],
    {
      duration: FLIGHT_DURATION,
      delay: item.delay,
      easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)',
      fill: 'both'
    }
  );
}

/** 记录拖拽层中牌组的当前位置，供松手后的 FLIP 从指针处起步 */
function captureDragRects(run: readonly Card[]): void {
  const els = document.querySelectorAll<HTMLElement>('.drag-layer .drag-card');
  run.forEach((card, k) => {
    const el = els[k];
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    pendingDragRects.set(card.id, { left: rect.left, top: rect.top });
  });
}

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
      attemptMove(from, index, target, d.run);
    }
    return;
  }
  drag.value = null;
  hoverColumn.value = null;
  if (d.run) {
    handleCardClick(d.from, d.index);
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
function attemptMove(from: number, index: number, to: number, dragRun?: readonly Card[]): boolean {
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
  if (dragRun) {
    // 松手即移动：让牌从指针所在位置滑向落点
    captureDragRects(dragRun);
  }
  emit('move', from, index, to);
  return true;
}

/**
 * 单击卡牌（未发生拖动）：在合法落点中自动选一处（同花延续优先）移过去；
 * 没有落点时抖动原列提示。按住拖过阈值则走拖拽，落点由玩家自选
 */
function handleCardClick(from: number, index: number): void {
  const column = props.columns[from];
  const run = column ? getMovableRun(column, index) : null;
  if (!run) {
    return;
  }
  const target = findAutoMove(props.columns, from, index);
  if (!target) {
    triggerShake(from);
    return;
  }
  emit('move', target.from, target.index, target.to);
}
</script>

<style scoped lang="less">
.board-wrap {
  display: flex;
  justify-content: center;
  flex: 1;
  padding: 0 16px 20px;
}

.board {
  width: 100%;
  max-width: 1220px;
  min-height: 340px;
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

  &.card-flying {
    /* 滑移过程中浮到最上层，避免被静止牌遮挡 */
    z-index: 80 !important;
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

.flight-layer {
  position: fixed;
  inset: 0;
  z-index: 950;
  pointer-events: none;

  .flight-card {
    position: absolute;
    transform-origin: center;
    will-change: transform, opacity;

    :deep(.card) {
      box-shadow:
        0 8px 20px rgba(0, 0, 0, 0.35),
        0 2px 6px rgba(0, 0, 0, 0.25);
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
