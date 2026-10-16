import { describe, expect, it } from 'vitest';
import { canDeal, canDropOn, getMovableRun, hasCompleteRun } from '@/core/rules';
import { makeState, testCard, twelveDownToTwo } from './helpers';

describe('rules：可移动牌组', () => {
  it('背面牌不可移动', () => {
    const column = [testCard('spades', 9), testCard('spades', 8, false)];
    expect(getMovableRun(column, 1)).toBeNull();
  });

  it('同花递减序列整组可动，花色变化处截断', () => {
    const column = [testCard('spades', 9), testCard('spades', 8), testCard('hearts', 7)];
    const run = getMovableRun(column, 0);
    expect(run?.map((card) => card.rank)).toEqual([9, 8]);
  });

  it('点数不连续处截断（9♠7♠ 只能移动 9♠）', () => {
    const column = [testCard('spades', 9), testCard('spades', 7)];
    expect(getMovableRun(column, 0)?.map((card) => card.rank)).toEqual([9]);
  });

  it('从序列中段取，返回该段到截断点的前缀', () => {
    const column = [testCard('spades', 9), testCard('spades', 8), testCard('spades', 7)];
    expect(getMovableRun(column, 1)?.map((card) => card.rank)).toEqual([8, 7]);
    expect(getMovableRun(column, 2)?.map((card) => card.rank)).toEqual([7]);
  });

  it('越界与尾部单张', () => {
    const column = [testCard('spades', 9)];
    expect(getMovableRun(column, 5)).toBeNull();
    expect(getMovableRun(column, 0)?.map((card) => card.rank)).toEqual([9]);
  });
});

describe('rules：落点判定', () => {
  it('空列可放，顶牌大 1 可放（不限花色）', () => {
    const run = [testCard('spades', 8)];
    expect(canDropOn(undefined, run)).toBe(true);
    expect(canDropOn(testCard('hearts', 9), run)).toBe(true);
    expect(canDropOn(testCard('clubs', 9), run)).toBe(true);
  });

  it('顶牌点数不匹配、或顶牌是背面都不行', () => {
    const run = [testCard('spades', 8)];
    expect(canDropOn(testCard('spades', 10), run)).toBe(false);
    expect(canDropOn(testCard('spades', 8), run)).toBe(false);
    expect(canDropOn(testCard('spades', 9, false), run)).toBe(false);
  });

  it('空牌组不能放到任何地方', () => {
    expect(canDropOn(undefined, [])).toBe(false);
  });
});

describe('rules：完整同花顺检测', () => {
  it('K→A 同花 13 张全部正面才算完成', () => {
    const complete = [...twelveDownToTwo('spades'), testCard('spades', 1)];
    expect(hasCompleteRun(complete)).toBe(true);
    // 前 13 张之外的内容不影响判断
    expect(hasCompleteRun([testCard('clubs', 9), ...complete])).toBe(true);
  });

  it('有背面牌不算完成', () => {
    const complete = [...twelveDownToTwo('spades'), testCard('spades', 1)];
    complete[0] = { ...complete[0]!, faceUp: false };
    expect(hasCompleteRun(complete)).toBe(false);
  });

  it('花色混合不算完成', () => {
    const complete = [...twelveDownToTwo('spades'), testCard('spades', 1)];
    complete[5] = testCard('hearts', 8);
    expect(hasCompleteRun(complete)).toBe(false);
  });

  it('不足 13 张不算完成', () => {
    expect(hasCompleteRun(twelveDownToTwo('spades'))).toBe(false);
  });
});

describe('rules：发牌条件', () => {
  it('没有空列且牌堆充足可以发牌', () => {
    const state = makeState({
      columns: Array.from({ length: 10 }, () => [testCard('spades', 5)]),
      stock: Array.from({ length: 50 }, (_, i) => testCard('diamonds', (i % 13) + 1, false))
    });
    expect(canDeal(state)).toBe(true);
  });

  it('有空列或牌堆不足时不能发牌', () => {
    const base = {
      columns: Array.from({ length: 10 }, () => [testCard('spades', 5)]),
      stock: Array.from({ length: 50 }, (_, i) => testCard('diamonds', (i % 13) + 1, false))
    };
    const emptyColumn = makeState({
      ...base,
      columns: Array.from({ length: 10 }, (_, i) => (i === 3 ? [] : [testCard('spades', 5)]))
    });
    expect(canDeal(emptyColumn)).toBe(false);

    const lowStock = makeState({ ...base, stock: base.stock.slice(0, 5) });
    expect(canDeal(lowStock)).toBe(false);

    const won = makeState({ ...base, status: 'won' });
    expect(canDeal(won)).toBe(false);
  });
});
