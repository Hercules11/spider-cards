<template>
  <a-config-provider :theme="appTheme">
    <div class="app">
      <header class="app-header">
        <div class="brand">
          <span class="brand-suit">♠</span>
          <div class="brand-text">
            <h1>{{ $t('title') }}</h1>
            <p class="subtitle">{{ $t('subtitle') }}</p>
          </div>
        </div>

        <div class="difficulty-group" role="group" :aria-label="$t('difficulty.label')">
          <button
            v-for="item in DIFFICULTY_OPTIONS"
            :key="item.value"
            type="button"
            class="difficulty-btn"
            :class="{ active: state?.difficulty === item.value }"
            :title="$t(`difficulty.${item.value}-tip`)"
            @click="requestDifficulty(item.value)"
          >
            <span class="suits">{{ item.suits }}</span>
            <span class="name">{{ $t(`difficulty.${item.value}`) }}</span>
          </button>
        </div>

        <div class="header-actions">
          <button
            class="theme-toggle"
            type="button"
            :aria-label="isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'"
            :title="isDarkTheme ? 'Light theme' : 'Dark theme'"
            @click="toggleTheme"
          >
            <BulbFilled v-if="isDarkTheme" />
            <BulbOutlined v-else />
          </button>
          <a-switch v-model:checked="showTrans" checked-children="En" un-checked-children="中" />
        </div>
      </header>

      <StatsBar
        v-if="state"
        :score="state.score"
        :moves="state.moves"
        :seconds="elapsedSeconds"
        :completed="state.completed"
        :deals="dealsLeft"
        :can-undo="canUndo"
        :stock-hint="hintDeal"
        :busy="autoPhase !== null"
        @undo="onUndo"
        @hint="onHint"
        @new-game="requestNewGame"
        @help="helpOpen = true"
        @deal="onDeal"
      />

      <div class="board-area">
        <GameBoard
          v-if="state"
          :columns="state.columns"
          :hint-move="hintMove"
          :disabled="boardLocked"
          :action="boardAction"
          :completed-count="state.completed.length"
          @move="onMove"
        />
        <div v-else class="board-placeholder">
          <div class="placeholder-table">
            <span class="placeholder-suits">♠ ♥ ♦ ♣</span>
          </div>
        </div>

        <Transition name="auto-fade">
          <div v-if="showAutoLayer" class="auto-layer">
            <button
              v-if="autoPhase !== 'playing'"
              type="button"
              class="auto-complete-btn"
              :disabled="autoPhase === 'solving'"
              @click="startAutoComplete"
            >
              <span class="auto-spark" aria-hidden="true">✦</span>
              <span class="auto-label">{{
                autoPhase === 'solving' ? $t('auto.solving') : $t('auto.button')
              }}</span>
              <span v-if="autoPhase !== 'solving'" class="auto-tip">{{ $t('auto.tip') }}</span>
            </button>
            <button
              v-else
              type="button"
              class="auto-fast-btn"
              :disabled="autoFast"
              @click="autoFast = true"
            >
              ⏩ {{ $t('auto.fast') }}
            </button>
          </div>
        </Transition>
      </div>

      <footer class="app-footer">
        <a
          class="github-link"
          :href="REPO_URL"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="$t('footer')"
          :title="$t('footer')"
        >
          <GithubFilled />
        </a>
      </footer>
    </div>

    <DifficultyModal v-model:open="difficultyOpen" @select="startGame" />
    <HelpModal v-model:open="helpOpen" />
    <WinModal
      v-model:open="winOpen"
      :state="state"
      :elapsed-seconds="elapsedSeconds"
      :stats="state ? stats[state.difficulty] : null"
      @restart="playAgain"
      @change-difficulty="changeDifficulty"
    />
  </a-config-provider>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { message as antMessage, Modal as AntModal } from 'ant-design-vue';
import { BulbFilled, BulbOutlined, GithubFilled } from '@ant-design/icons-vue';
import type { CardMove, Difficulty } from '@/types';
import DifficultyModal from './components/DifficultyModal.vue';
import GameBoard from './components/GameBoard.vue';
import HelpModal from './components/HelpModal.vue';
import StatsBar from './components/StatsBar.vue';
import WinModal from './components/WinModal.vue';
import { isFullyRevealed, solveGame } from './core/autocomplete';
import { useGame } from './composables/useGame';
import { useLocale } from './composables/useLocale';
import { useTheme } from './composables/useTheme';

const REPO_URL = 'https://github.com/Hercules11/spider-cards';

const { t } = useI18n();
const { isDarkTheme, appTheme, toggleTheme } = useTheme();
const { showTrans } = useLocale();
const {
  state,
  stats,
  elapsedSeconds,
  hasGame,
  isWon,
  canUndo,
  dealsLeft,
  startNewGame,
  move,
  deal,
  undo,
  hint
} = useGame();

const DIFFICULTY_OPTIONS: Array<{ value: Difficulty; suits: string }> = [
  { value: 'easy', suits: '♠' },
  { value: 'medium', suits: '♠♥' },
  { value: 'hard', suits: '♠♥♦♣' }
];

// ---------- 弹窗状态 ----------
/** 首次进入（无存档）先选难度 */
const difficultyOpen = ref(!hasGame.value);
const helpOpen = ref(false);
const winOpen = ref(false);

watch(
  isWon,
  (won) => {
    if (won) {
      winOpen.value = true;
    }
  },
  { immediate: true }
);

// ---------- 提示 ----------
const hintMove = ref<CardMove | null>(null);
const hintDeal = ref(false);
let hintTimer: number | null = null;

function clearHint(): void {
  hintMove.value = null;
  hintDeal.value = false;
  if (hintTimer !== null) {
    window.clearTimeout(hintTimer);
    hintTimer = null;
  }
}

function onHint(): void {
  if (!state.value || isWon.value) {
    return;
  }
  clearHint();
  const result = hint();
  if (!result) {
    antMessage.info(t('msg.no-moves'));
    return;
  }
  if (result.kind === 'deal') {
    hintDeal.value = true;
    antMessage.info(t('msg.try-deal'));
  } else {
    hintMove.value = result.move;
  }
  hintTimer = window.setTimeout(clearHint, 3200);
}

// ---------- 自动完成 ----------
/** 牌桌动画编排标记：最近一次操作的类型 */
const boardAction = ref<'new' | 'deal' | 'move' | 'undo'>('move');
/** 自动完成流程：null 空闲 / solving 求解中 / playing 自动整理中 */
const autoPhase = ref<'solving' | 'playing' | null>(null);
const autoFast = ref(false);
let autoTimer: number | null = null;

/** 全部牌面亮出（牌堆空 + 桌面全正面）时可自动收尾 */
const canAutoComplete = computed(() => !!state.value && isFullyRevealed(state.value));
const showAutoLayer = computed(
  () => !isWon.value && (canAutoComplete.value || autoPhase.value !== null)
);
const boardLocked = computed(() => isWon.value || autoPhase.value !== null);

function cancelAutoPlay(): void {
  if (autoTimer !== null) {
    window.clearTimeout(autoTimer);
    autoTimer = null;
  }
  autoPhase.value = null;
  autoFast.value = false;
}

function startAutoComplete(): void {
  if (autoPhase.value !== null || !state.value) {
    return;
  }
  autoPhase.value = 'solving';
  // 先让「计算中…」渲染出来，再做同步求解
  window.setTimeout(() => {
    if (autoPhase.value !== 'solving' || !state.value) {
      return;
    }
    const result = solveGame(state.value);
    if (result.status !== 'solved' || result.moves.length === 0) {
      autoPhase.value = null;
      promptAutoFailure();
      return;
    }
    autoPhase.value = 'playing';
    playSolution(result.moves);
  }, 40);
}

function promptAutoFailure(): void {
  AntModal.confirm({
    title: t('auto.fail-title'),
    content: t('auto.fail-body'),
    okText: t('auto.restart'),
    cancelText: t('auto.keep'),
    centered: true,
    wrapClassName: 'custom-dialogue',
    onOk() {
      startGame(state.value?.difficulty ?? 'easy');
    }
  });
}

/** 按求解方案逐步执行；收牌后多停一拍让动画播完 */
function playSolution(moves: CardMove[]): void {
  let cursor = 0;
  const step = (): void => {
    autoTimer = null;
    if (autoPhase.value !== 'playing' || !state.value) {
      return;
    }
    if (cursor >= moves.length) {
      autoPhase.value = null;
      autoFast.value = false;
      return;
    }
    const beforeCompleted = state.value.completed.length;
    const moveStep = moves[cursor++]!;
    boardAction.value = 'move';
    if (!move(moveStep.from, moveStep.index, moveStep.to)) {
      // 防御：求解方案应始终合法；异常时直接结束
      autoPhase.value = null;
      autoFast.value = false;
      return;
    }
    const collected = state.value.completed.length > beforeCompleted;
    const base = autoFast.value ? 80 : 240;
    const pause = collected ? base + (autoFast.value ? 240 : 700) : base;
    autoTimer = window.setTimeout(step, pause);
  };
  step();
}

// ---------- 游戏操作 ----------
function onMove(from: number, index: number, to: number): void {
  boardAction.value = 'move';
  clearHint();
  move(from, index, to);
}

function onUndo(): void {
  if (autoPhase.value !== null) {
    return;
  }
  boardAction.value = 'undo';
  clearHint();
  undo();
}

function onDeal(): void {
  if (!state.value || isWon.value || autoPhase.value !== null) {
    return;
  }
  boardAction.value = 'deal';
  const failure = deal();
  if (failure === 'empty-column') {
    antMessage.warning(t('msg.empty-column'));
  } else if (failure === 'no-deals') {
    antMessage.warning(t('msg.no-deals'));
  } else {
    clearHint();
  }
}

// ---------- 开局 / 换难度 ----------
function startGame(difficulty: Difficulty): void {
  cancelAutoPlay();
  boardAction.value = 'new';
  clearHint();
  startNewGame(difficulty);
  difficultyOpen.value = false;
  winOpen.value = false;
}

function confirmRestart(difficulty: Difficulty): void {
  AntModal.confirm({
    title: t('confirm.switch'),
    okText: t('confirm.ok'),
    cancelText: t('confirm.cancel'),
    centered: true,
    maskClosable: true,
    wrapClassName: 'custom-dialogue',
    onOk() {
      startGame(difficulty);
    }
  });
}

function requestDifficulty(difficulty: Difficulty): void {
  if (!state.value || state.value.moves === 0) {
    startGame(difficulty);
    return;
  }
  confirmRestart(difficulty);
}

function requestNewGame(): void {
  if (state.value?.difficulty) {
    requestDifficulty(state.value.difficulty);
  } else {
    difficultyOpen.value = true;
  }
}

function playAgain(): void {
  winOpen.value = false;
  startGame(state.value?.difficulty ?? 'easy');
}

function changeDifficulty(): void {
  winOpen.value = false;
  difficultyOpen.value = true;
}

// ---------- 键盘快捷键 ----------
function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  ) {
    return;
  }
  if (difficultyOpen.value || winOpen.value || autoPhase.value !== null) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === 'z' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    onUndo();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  switch (key) {
    case 'u':
      onUndo();
      break;
    case 'h':
      onHint();
      break;
    case 'd':
      onDeal();
      break;
    case ' ':
      if (!helpOpen.value) {
        event.preventDefault();
        onDeal();
      }
      break;
    case 'n':
      requestNewGame();
      break;
    case 'r':
      helpOpen.value = !helpOpen.value;
      break;
    default:
      break;
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  if (hintTimer !== null) {
    window.clearTimeout(hintTimer);
  }
  cancelAutoPlay();
});
</script>

<style scoped lang="less">
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding-top: 20px;
  background-color: var(--color-page-background);
  color: var(--color-text);
  transition:
    background-color 0.3s,
    color 0.3s;
}

.app-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 24px;
  width: 100%;
  max-width: 1220px;
  margin: 0 auto 14px;
  padding: 0 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;

  .brand-suit {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    font-size: 1.6rem;
    color: #ffffff;
    background: linear-gradient(160deg, var(--color-felt-start), var(--color-felt-end));
    box-shadow: 0 4px 12px var(--color-shadow-card);
  }

  h1 {
    margin: 0;
    font-size: 1.45rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--color-heading);
    line-height: 1.2;
  }

  .subtitle {
    margin: 0;
    font-size: 0.78rem;
    color: var(--color-text-muted);
  }
}

.difficulty-group {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);

  .difficulty-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    min-width: 74px;
    padding: 5px 12px;
    border: none;
    border-radius: 9px;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      color 0.2s ease;

    .suits {
      font-size: 0.78rem;
      letter-spacing: 2px;
    }

    .name {
      font-size: 0.86rem;
      font-weight: 600;
    }

    &:hover {
      color: var(--color-heading);
    }

    &.active {
      background: var(--color-accent);
      color: var(--color-accent-text);

      .name {
        color: var(--color-accent-text);
      }
    }
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;

  .theme-toggle {
    width: 32px;
    height: 32px;
    border: 1px solid var(--color-border);
    border-radius: 50%;
    color: var(--color-text);
    background-color: var(--color-surface);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      background-color 0.3s,
      border-color 0.3s,
      color 0.3s;

    &:hover {
      border-color: var(--color-border-strong);
      color: var(--color-heading);
    }
  }

  :deep(.ant-switch-inner-checked) {
    color: var(--color-accent-text);
  }
}

.board-area {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.auto-layer {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.auto-complete-btn {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 15px 32px;
  border: 1px solid color-mix(in srgb, var(--color-drop-ok) 55%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-surface) 74%, transparent);
  backdrop-filter: blur(6px);
  color: var(--color-heading);
  cursor: pointer;
  animation: auto-pulse 2.2s ease-in-out infinite;
  transition: transform 0.15s ease;

  .auto-spark {
    font-size: 1rem;
    color: var(--color-drop-ok);
  }

  .auto-label {
    font-size: 1.18rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .auto-tip {
    font-size: 0.76rem;
    color: var(--color-text-muted);
  }

  &:hover:not(:disabled) {
    transform: translateY(-2px) scale(1.02);
  }

  &:disabled {
    cursor: default;
    opacity: 0.85;
    animation: none;
  }
}

.auto-fast-btn {
  pointer-events: auto;
  padding: 8px 18px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-surface) 80%, transparent);
  backdrop-filter: blur(6px);
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--color-heading);
    border-color: var(--color-border-strong);
  }

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
}

.auto-fade-enter-active,
.auto-fade-leave-active {
  transition: opacity 0.25s ease;
}

.auto-fade-enter-from,
.auto-fade-leave-to {
  opacity: 0;
}

@keyframes auto-pulse {
  0%,
  100% {
    box-shadow:
      0 12px 34px var(--color-shadow-card),
      0 0 0 6px color-mix(in srgb, var(--color-drop-ok) 14%, transparent);
  }
  50% {
    box-shadow:
      0 12px 34px var(--color-shadow-card),
      0 0 0 14px color-mix(in srgb, var(--color-drop-ok) 6%, transparent);
  }
}

.board-placeholder {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 0 16px 20px;

  .placeholder-table {
    flex: 1;
    max-width: 1220px;
    min-height: 340px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 18px;
    background: linear-gradient(165deg, var(--color-felt-start), var(--color-felt-end));
    box-shadow: inset 0 -14px 40px var(--color-felt-edge);
  }

  .placeholder-suits {
    font-size: 2rem;
    letter-spacing: 10px;
    color: var(--color-felt-label);
  }
}

.app-footer {
  position: fixed;
  right: 20px;
  bottom: 18px;
  z-index: 20;

  .github-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    font-size: 1.35rem;
    color: var(--color-text-muted);
    background-color: color-mix(in srgb, var(--color-surface) 90%, transparent);
    border: 1px solid var(--color-border);
    box-shadow: 0 6px 16px var(--color-shadow-card);
    transition:
      color 0.2s ease,
      border-color 0.2s ease,
      transform 0.2s ease;

    &:hover {
      color: var(--color-heading);
      border-color: var(--color-border-strong);
      transform: translateY(-2px);
    }
  }
}

@media (max-width: 860px) {
  .header-actions {
    margin-left: 0;
  }
}
</style>
