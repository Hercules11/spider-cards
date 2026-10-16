import { describe, expect, it } from 'vitest';
import {
  cloneState,
  createGame,
  dealRow,
  dealsLeft,
  findAutoMove,
  findHint,
  moveCards
} from '@/core/engine';
import { makeState, mulberry32, testCard, twelveDownToTwo } from './helpers';

describe('engine：开局发牌', () => {
  const game = createGame('easy', mulberry32(7));

  it('10 列布局：前 4 列 6 张，其余 5 张，每列只翻最后一张', () => {
    expect(game.columns).toHaveLength(10);
    game.columns.forEach((column, index) => {
      expect(column).toHaveLength(index < 4 ? 6 : 5);
      column.forEach((card, cardIndex) => {
        expect(card.faceUp).toBe(cardIndex === column.length - 1);
      });
    });
  });

  it('104 张牌全部在桌面上（54 张）或牌堆中（50 张），初始分数 500', () => {
    const total = game.columns.reduce((sum, column) => sum + column.length, 0) + game.stock.length;
    expect(total).toBe(104);
    expect(game.stock).toHaveLength(50);
    expect(game.score).toBe(500);
    expect(game.moves).toBe(0);
    expect(game.status).toBe('playing');
    expect(dealsLeft(game)).toBe(5);
  });
});

describe('engine：移动', () => {
  it('合法移动：整组牌落到目标列，步数 +1、分数 -1，原状态不变（写时复制）', () => {
    const state = makeState({
      columns: [
        [testCard('spades', 9), testCard('spades', 8)],
        [testCard('hearts', 10)],
        ...Array.from({ length: 8 }, () => [] as ReturnType<typeof testCard>[])
      ]
    });
    const next = moveCards(state, 0, 0, 1);
    expect(next).not.toBeNull();
    expect(next!.columns[0]).toHaveLength(0);
    expect(next!.columns[1]!.map((card) => card.rank)).toEqual([10, 9, 8]);
    expect(next!.moves).toBe(1);
    expect(next!.score).toBe(499);
    // 原状态未被修改
    expect(state.columns[0]).toHaveLength(2);
    expect(state.columns[1]).toHaveLength(1);
    expect(state.moves).toBe(0);
  });

  it('移动后露出背面牌自动翻开', () => {
    const state = makeState({
      columns: [[testCard('hearts', 13, false), testCard('spades', 5)], [testCard('clubs', 6)]]
    });
    const next = moveCards(state, 0, 1, 1);
    expect(next!.columns[0]![0]!.faceUp).toBe(true);
  });

  it('非法移动：点数不匹配 / 起点背面 / 目标自身 / 对局已结束', () => {
    const state = makeState({
      columns: [[testCard('spades', 8)], [testCard('spades', 10)], [testCard('spades', 9, false)]]
    });
    expect(moveCards(state, 0, 0, 1)).toBeNull();
    expect(moveCards(state, 2, 0, 1)).toBeNull();
    expect(moveCards(state, 0, 0, 0)).toBeNull();
    const won = { ...state, status: 'won' as const };
    expect(moveCards(won, 0, 0, 1)).toBeNull();
  });
});

describe('engine：完成同花顺结算', () => {
  it('补上 A 凑成 K→A 后整组收走：+100 分并翻开新露出的底牌', () => {
    const state = makeState({
      columns: [
        [testCard('spades', 1)],
        [testCard('hearts', 12, false), ...twelveDownToTwo('spades')]
      ]
    });
    const next = moveCards(state, 0, 0, 1);
    expect(next!.completed).toEqual(['spades']);
    // 500 - 1（移动）+ 100（完成）
    expect(next!.score).toBe(599);
    expect(next!.columns[1]).toHaveLength(1);
    expect(next!.columns[1]![0]!.faceUp).toBe(true);
    expect(next!.status).toBe('playing');
  });

  it('集齐第 8 组时对局判定获胜', () => {
    const completed = Array.from({ length: 7 }, () => 'spades' as const);
    const state = makeState({
      completed: [...completed],
      columns: [[testCard('spades', 1)], twelveDownToTwo('spades')]
    });
    const next = moveCards(state, 0, 0, 1);
    expect(next!.completed).toHaveLength(8);
    expect(next!.status).toBe('won');
  });
});

describe('engine：发牌', () => {
  it('每列各发一张正面牌，牌堆 -10，步数 +1', () => {
    const game = createGame('medium', mulberry32(3));
    const next = dealRow(game)!;
    next.columns.forEach((column, index) => {
      expect(column).toHaveLength(game.columns[index]!.length + 1);
      expect(column[column.length - 1]!.faceUp).toBe(true);
    });
    expect(next.stock).toHaveLength(40);
    expect(next.moves).toBe(1);
    expect(next.score).toBe(499);
  });

  it('有空列时不能发牌，返回 null', () => {
    const game = createGame('easy', mulberry32(5));
    const withEmpty = cloneState(game);
    withEmpty.columns[0] = [];
    expect(dealRow(withEmpty)).toBeNull();
  });

  it('牌堆不足一次发牌时返回 null', () => {
    const game = createGame('easy', mulberry32(5));
    const next = cloneState(game);
    next.stock = next.stock.slice(0, 8);
    expect(dealRow(next)).toBeNull();
  });
});

describe('engine：提示', () => {
  it('优先推荐同花延续的落点', () => {
    const state = makeState({
      columns: [[testCard('spades', 9)], [testCard('hearts', 10)], [testCard('spades', 10)]]
    });
    const hint = findHint(state);
    expect(hint).toEqual({ kind: 'move', move: { from: 0, index: 0, to: 2 } });
  });

  it('无可用移动但能发牌时建议发牌', () => {
    const state = makeState({
      columns: Array.from({ length: 10 }, (_, i) => [testCard('spades', (i % 13) + 1, false)]),
      stock: Array.from({ length: 50 }, (_, i) => testCard('diamonds', (i % 13) + 1, false))
    });
    expect(findHint(state)).toEqual({ kind: 'deal' });
  });

  it('整列搬到空列等于原地打转，不推荐', () => {
    const state = makeState({
      columns: [[testCard('spades', 5)], [], ...Array.from({ length: 8 }, () => [] as never[])]
    });
    expect(findHint(state)).toBeNull();
  });

  it('对局结束或彻底走死时返回 null', () => {
    const dead = makeState({
      columns: Array.from({ length: 10 }, (_, i) => [testCard('hearts', (i % 13) + 1, false)])
    });
    expect(findHint(dead)).toBeNull();
    expect(findHint({ ...dead, status: 'won' })).toBeNull();
  });
});

describe('engine：单击自动移动', () => {
  it('优先同花落点，其次任意落点，空列需能翻牌', () => {
    const state = makeState({
      columns: [
        [testCard('hearts', 13, false), testCard('spades', 9)],
        [testCard('spades', 10)],
        [testCard('clubs', 10)]
      ]
    });
    const move = findAutoMove(state.columns, 0, 1);
    expect(move).toEqual({ from: 0, index: 1, to: 1 });

    // 无同花落点时用普通落点
    const unsuited = makeState({
      columns: [[testCard('spades', 9)], [testCard('clubs', 10)]]
    });
    expect(findAutoMove(unsuited.columns, 0, 0)).toEqual({ from: 0, index: 0, to: 1 });

    // 只有空列且不能翻牌时不动
    const toEmpty = makeState({
      columns: [[testCard('spades', 9)], []]
    });
    expect(findAutoMove(toEmpty.columns, 0, 0)).toBeNull();
  });
});
