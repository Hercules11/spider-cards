/** 游戏难度：简单 1 花色 / 中等 2 花色 / 困难 4 花色 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/** 四种花色 */
export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

/** 一张牌：rank 1-13 对应 A-K */
export interface Card {
  /** 全局唯一 id（如 spades-13-0），拖动与动画 key 使用 */
  id: string;
  suit: Suit;
  rank: number;
  faceUp: boolean;
}

/** 游戏完整状态（纯 JSON，可直接序列化） */
export interface GameState {
  difficulty: Difficulty;
  /** 10 列牌桌 */
  columns: Card[][];
  /** 待发的牌堆，每 10 张为一次发牌 */
  stock: Card[];
  /** 已完成的 K→A 同花顺（按完成顺序记录花色） */
  completed: Suit[];
  score: number;
  moves: number;
  status: 'playing' | 'won';
}

/** 一次移动：把 from 列 index 起的同花顺移到 to 列 */
export interface CardMove {
  from: number;
  index: number;
  to: number;
}

/** 提示结果：一处可用的移动，或建议发牌（没有可用移动但还能发牌） */
export type Hint = { kind: 'move'; move: CardMove } | { kind: 'deal' };

/** 单难度最佳成绩 */
export interface DifficultyStats {
  gamesWon: number;
  bestScore: number | null;
  bestTimeSeconds: number | null;
  bestMoves: number | null;
}

export type StatsMap = Record<Difficulty, DifficultyStats>;

/** localStorage 中的存档格式 */
export interface SavedGame {
  state: GameState;
  elapsedSeconds: number;
}
