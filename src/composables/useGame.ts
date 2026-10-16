import { computed, onScopeDispose, ref, watch } from 'vue';
import type {
  Card,
  CardMove,
  Difficulty,
  DifficultyStats,
  GameState,
  Hint,
  SavedGame,
  StatsMap
} from '@/types';
import {
  createGame,
  dealRow,
  dealsLeft as countDealsLeft,
  findAutoMove,
  findHint,
  moveCards
} from '@/core/engine';
import { readJSON, removeItem, STORAGE_KEYS, writeJSON } from '@/utils/storage';

/** 发牌失败原因（App 层翻译为提示文案） */
export type DealFailure = 'empty-column' | 'no-deals';

const DEFAULT_STATS: StatsMap = {
  easy: { gamesWon: 0, bestScore: null, bestTimeSeconds: null, bestMoves: null },
  medium: { gamesWon: 0, bestScore: null, bestTimeSeconds: null, bestMoves: null },
  hard: { gamesWon: 0, bestScore: null, bestTimeSeconds: null, bestMoves: null }
};

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

function isCard(value: unknown): value is Card {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const card = value as Card;
  return (
    typeof card.id === 'string' &&
    typeof card.rank === 'number' &&
    typeof card.faceUp === 'boolean' &&
    typeof card.suit === 'string'
  );
}

function isGameState(value: unknown): value is GameState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const state = value as GameState;
  return (
    DIFFICULTIES.includes(state.difficulty) &&
    Array.isArray(state.columns) &&
    state.columns.length === 10 &&
    state.columns.every((column) => Array.isArray(column) && column.every(isCard)) &&
    Array.isArray(state.stock) &&
    state.stock.every(isCard) &&
    Array.isArray(state.completed) &&
    typeof state.score === 'number' &&
    typeof state.moves === 'number' &&
    (state.status === 'playing' || state.status === 'won')
  );
}

/** 读取存档（结构损坏时直接丢弃，不阻塞进入游戏） */
function loadSavedGame(): SavedGame | null {
  const saved = readJSON<unknown>(STORAGE_KEYS.savedGame, null);
  if (typeof saved !== 'object' || saved === null) {
    return null;
  }
  const candidate = saved as SavedGame;
  if (!isGameState(candidate.state) || typeof candidate.elapsedSeconds !== 'number') {
    return null;
  }
  return candidate;
}

function loadStats(): StatsMap {
  const raw = readJSON<Partial<Record<Difficulty, Partial<DifficultyStats>>>>(
    STORAGE_KEYS.stats,
    {}
  );
  const pick = (difficulty: Difficulty): DifficultyStats => ({
    ...DEFAULT_STATS[difficulty],
    ...(raw[difficulty] ?? {})
  });
  return { easy: pick('easy'), medium: pick('medium'), hard: pick('hard') };
}

/**
 * 游戏状态中枢：包装纯函数引擎，提供响应式状态、撤销历史、
 * 计时、成绩统计与 localStorage 持久化（刷新可接着玩）
 */
export function useGame() {
  const restored = loadSavedGame();
  const state = ref<GameState | null>(restored?.state ?? null);
  const elapsedSeconds = ref(restored?.elapsedSeconds ?? 0);
  const history = ref<GameState[]>([]);
  const stats = ref<StatsMap>(loadStats());
  // 已计入成绩的胜利局（防止刷新后重复统计）
  const winCounted = ref(restored?.state.status === 'won');

  const hasGame = computed(() => state.value !== null);
  const isWon = computed(() => state.value?.status === 'won');
  const canUndo = computed(() => history.value.length > 0);
  const dealsLeft = computed(() => (state.value ? countDealsLeft(state.value) : 0));

  function persist(): void {
    if (!state.value) {
      return;
    }
    const payload: SavedGame = { state: state.value, elapsedSeconds: elapsedSeconds.value };
    writeJSON(STORAGE_KEYS.savedGame, payload);
  }

  function recordWin(won: GameState): void {
    const previous = stats.value[won.difficulty];
    const better = (a: number | null, b: number) => (a === null ? b : Math.min(a, b));
    const larger = (a: number | null, b: number) => (a === null ? b : Math.max(a, b));
    stats.value = {
      ...stats.value,
      [won.difficulty]: {
        gamesWon: previous.gamesWon + 1,
        bestScore: larger(previous.bestScore, won.score),
        bestTimeSeconds: better(previous.bestTimeSeconds, elapsedSeconds.value),
        bestMoves: better(previous.bestMoves, won.moves)
      }
    };
    writeJSON(STORAGE_KEYS.stats, stats.value);
  }

  // ---------- 计时：局面开始后（第一手起）每秒累计，胜利即停 ----------
  const timerActive = computed(() => state.value?.status === 'playing' && state.value.moves > 0);

  const timerId = window.setInterval(() => {
    if (!timerActive.value) {
      return;
    }
    elapsedSeconds.value += 1;
    // 每 10 秒落一次盘，兼顾刷新不丢太多时间与写入频率
    if (elapsedSeconds.value % 10 === 0) {
      persist();
    }
  }, 1000);

  const handlePageHide = () => persist();

  window.addEventListener('pagehide', handlePageHide);

  // ---------- 胜利结算 ----------
  watch(
    () => state.value?.status,
    (status) => {
      if (status === 'won' && state.value && !winCounted.value) {
        winCounted.value = true;
        recordWin(state.value);
        persist();
      }
    }
  );

  // ---------- 操作 ----------
  /** 开始新的一局（替换当前进度） */
  function startNewGame(difficulty: Difficulty): void {
    state.value = createGame(difficulty);
    history.value = [];
    elapsedSeconds.value = 0;
    winCounted.value = false;
    persist();
  }

  /** 应用一次移动：成功返回 true（失败时忽略，历史不变） */
  function move(from: number, index: number, to: number): boolean {
    if (!state.value) {
      return false;
    }
    const next = moveCards(state.value, from, index, to);
    if (!next) {
      return false;
    }
    history.value.push(state.value);
    state.value = next;
    persist();
    return true;
  }

  /** 自动移动（单击卡牌）：找不到落点返回 false */
  function autoMove(from: number, index: number): boolean {
    if (!state.value || state.value.status !== 'playing') {
      return false;
    }
    const target: CardMove | null = findAutoMove(state.value.columns, from, index);
    if (!target) {
      return false;
    }
    return move(target.from, target.index, target.to);
  }

  /** 发一排牌：成功返回 null，失败返回原因 */
  function deal(): DealFailure | null {
    if (!state.value || state.value.status !== 'playing') {
      return null;
    }
    if (state.value.columns.some((column) => column.length === 0)) {
      return 'empty-column';
    }
    const next = dealRow(state.value);
    if (!next) {
      return 'no-deals';
    }
    history.value.push(state.value);
    state.value = next;
    persist();
    return null;
  }

  /** 撤销上一步（步数/分数一并回退，时间不回退） */
  function undo(): boolean {
    const previous = history.value.pop();
    if (!previous) {
      return false;
    }
    state.value = previous;
    persist();
    return true;
  }

  /** 获取当前提示 */
  function hint(): Hint | null {
    return state.value ? findHint(state.value) : null;
  }

  /** 清空存档与统计（供调试与未来 UI 使用） */
  function resetAll(): void {
    removeItem(STORAGE_KEYS.savedGame);
    removeItem(STORAGE_KEYS.stats);
    state.value = null;
    history.value = [];
    elapsedSeconds.value = 0;
    stats.value = loadStats();
  }

  onScopeDispose(() => {
    window.clearInterval(timerId);
    window.removeEventListener('pagehide', handlePageHide);
  });

  return {
    state,
    stats,
    elapsedSeconds,
    hasGame,
    isWon,
    canUndo,
    dealsLeft,
    startNewGame,
    move,
    autoMove,
    deal,
    undo,
    hint,
    resetAll
  };
}
