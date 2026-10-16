import { describe, expect, it } from 'vitest';
import { isFullyRevealed, solveGame } from '@/core/autocomplete';
import { moveCards } from '@/core/engine';
import type { Card, GameState, Suit } from '@/types';
import { makeState, testCard } from './helpers';

/** 构造某花色 rank 从 from 递减到 to（含两端）的牌组 */
function descend(suit: Suit, from: number, to: number): Card[] {
  const cards: Card[] = [];
  for (let rank = from; rank >= to; rank--) {
    cards.push(testCard(suit, rank));
  }
  return cards;
}

/** 按求解结果在引擎里重放，返回最终状态 */
function replay(state: GameState, moves: { from: number; index: number; to: number }[]): GameState {
  let current = state;
  for (const move of moves) {
    const next = moveCards(current, move.from, move.index, move.to);
    expect(next, `求解给出的第 ${current.moves + 1} 步应当合法`).not.toBeNull();
    current = next!;
  }
  return current;
}

const SEVEN_RUNS: Suit[] = [
  'spades',
  'hearts',
  'diamonds',
  'clubs',
  'spades',
  'hearts',
  'diamonds'
];

describe('autocomplete：全明牌判定', () => {
  it('牌堆为空且所有牌正面、进行中 → 全明牌', () => {
    const state = makeState({
      columns: [descend('spades', 13, 2), [], [], [], [], [], [], [], [], []],
      stock: []
    });
    expect(isFullyRevealed(state)).toBe(true);
  });

  it('牌堆未空、有背面牌或已获胜 → 不是全明牌', () => {
    const base = makeState({
      columns: [descend('spades', 13, 2), [], [], [], [], [], [], [], [], []]
    });
    expect(isFullyRevealed(makeState({ ...base, stock: [testCard('hearts', 5, false)] }))).toBe(
      false
    );

    const hidden = descend('spades', 13, 2);
    hidden[3] = { ...hidden[3]!, faceUp: false };
    expect(
      isFullyRevealed(makeState({ ...base, columns: [hidden, [], [], [], [], [], [], [], [], []] }))
    ).toBe(false);

    expect(isFullyRevealed(makeState({ ...base, status: 'won' }))).toBe(false);
  });
});

describe('autocomplete：求解器', () => {
  it('一步合流：9♠…A♠ 落到 10♠ 上直接收走第 8 组', () => {
    const state = makeState({
      columns: [descend('spades', 9, 1), descend('spades', 13, 10), [], [], [], [], [], [], [], []],
      completed: [...SEVEN_RUNS]
    });
    const result = solveGame(state);
    expect(result.status).toBe('solved');
    expect(result.moves).toHaveLength(1);
    expect(replay(state, result.moves).status).toBe('won');
  });

  it('两步收尾：先接中段再补 A', () => {
    const state = makeState({
      columns: [
        descend('spades', 13, 10),
        descend('spades', 9, 2),
        descend('spades', 1, 1),
        [],
        [],
        [],
        [],
        [],
        [],
        []
      ],
      completed: [...SEVEN_RUNS]
    });
    const result = solveGame(state);
    expect(result.status).toBe('solved');
    expect(result.moves).toHaveLength(2);
    expect(replay(state, result.moves).status).toBe('won');
  });

  it('死局（顶牌互不匹配且无空列）→ unsolvable', () => {
    const state = makeState({
      columns: [
        [testCard('spades', 13)],
        [testCard('hearts', 13)],
        [testCard('diamonds', 13)],
        [testCard('clubs', 13)],
        [testCard('spades', 13)],
        [testCard('hearts', 13)],
        [testCard('diamonds', 13)],
        [testCard('clubs', 13)],
        [testCard('spades', 1)],
        [testCard('hearts', 1)]
      ]
    });
    const result = solveGame(state);
    expect(result.status).toBe('unsolvable');
    expect(result.moves).toHaveLength(0);
  });

  it('节点预算耗尽 → timeout', () => {
    const state = makeState({
      columns: [
        descend('spades', 13, 10),
        descend('spades', 9, 2),
        descend('spades', 1, 1),
        [],
        [],
        [],
        [],
        [],
        [],
        []
      ],
      completed: [...SEVEN_RUNS]
    });
    const result = solveGame(state, { maxNodes: 1 });
    expect(result.status).toBe('timeout');
  });

  it('已收满 8 组 → 空方案', () => {
    const state = makeState({ completed: [...SEVEN_RUNS, 'clubs'] });
    const result = solveGame(state);
    expect(result.status).toBe('solved');
    expect(result.moves).toHaveLength(0);
  });
});
