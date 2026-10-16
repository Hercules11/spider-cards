import type { Card, Difficulty, Suit } from '@/types';

export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

/** 难度对应的花色集合；成副数量由 104 / (13 × 花色数) 推导：简单 8 套、中等 4 套、困难 2 套 */
export const DIFFICULTY_SUITS: Record<Difficulty, readonly Suit[]> = {
  easy: ['spades'],
  medium: ['spades', 'hearts'],
  hard: ['spades', 'hearts', 'diamonds', 'clubs']
};

/** 需要完成的花色套数（恒定 8 组获胜） */
export const SETS_PER_DIFFICULTY: Record<Difficulty, number> = {
  easy: 8,
  medium: 4,
  hard: 2
};

export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣'
};

/** rank 1-13 转 A-K 显示文本 */
export function rankLabel(rank: number): string {
  return RANK_LABELS[rank - 1] ?? '?';
}

/** 红色花色（红桃/方块），用于卡面着色 */
export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export type RandomFn = () => number;

/** Fisher-Yates 洗牌，不修改入参 */
export function shuffle<T>(items: readonly T[], random: RandomFn = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const current = result[i]!;
    result[i] = result[j]!;
    result[j] = current;
  }
  return result;
}

/**
 * 生成 104 张牌：难度下每个花色重复 SETS_PER_DIFFICULTY 套，
 * id 拼接花色+点数+套序号保证全局唯一
 */
export function createDeck(difficulty: Difficulty): Card[] {
  const suits = DIFFICULTY_SUITS[difficulty];
  const copies = SETS_PER_DIFFICULTY[difficulty];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (let set = 0; set < copies; set++) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ id: `${suit}-${rank}-${set}`, suit, rank, faceUp: false });
      }
    }
  }
  return deck;
}
