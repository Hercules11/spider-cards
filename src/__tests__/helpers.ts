import type { Card, GameState, Suit } from '@/types';

/** 简单可复现的伪随机数发生器（mulberry32），测试中替代 Math.random */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cardSeq = 0;

/** 构造一张测试牌：默认正面，id 递增保证唯一 */
export function testCard(suit: Suit, rank: number, faceUp = true): Card {
  cardSeq += 1;
  return { id: `test-${cardSeq}`, suit, rank, faceUp };
}

/** K→A 的 12 张（缺 A，用于测试补上 A 后成套） */
export function twelveDownToTwo(suit: Suit): Card[] {
  return [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((rank) => testCard(suit, rank));
}

/** 构造测试用 GameState：默认 10 列空桌、无牌堆 */
export function makeState(partial: Partial<GameState>): GameState {
  return {
    difficulty: 'easy',
    columns: Array.from({ length: 10 }, () => [] as Card[]),
    stock: [],
    completed: [],
    score: 500,
    moves: 0,
    status: 'playing',
    ...partial
  };
}
