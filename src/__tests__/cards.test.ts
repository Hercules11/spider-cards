import { describe, expect, it } from 'vitest';
import { createDeck, isRedSuit, rankLabel, shuffle, SUIT_SYMBOLS } from '@/core/cards';
import { mulberry32 } from './helpers';

describe('cards：牌堆生成与洗牌', () => {
  it('简单：104 张全部为黑桃', () => {
    const deck = createDeck('easy');
    expect(deck).toHaveLength(104);
    expect(deck.every((card) => card.suit === 'spades')).toBe(true);
  });

  it('中等：黑桃红桃各 52 张', () => {
    const deck = createDeck('medium');
    const spades = deck.filter((card) => card.suit === 'spades');
    const hearts = deck.filter((card) => card.suit === 'hearts');
    expect(deck).toHaveLength(104);
    expect(spades).toHaveLength(52);
    expect(hearts).toHaveLength(52);
  });

  it('困难：四种花色各 26 张，每个点数恰好出现 2 次', () => {
    const deck = createDeck('hard');
    for (const suit of ['spades', 'hearts', 'diamonds', 'clubs'] as const) {
      const group = deck.filter((card) => card.suit === suit);
      expect(group).toHaveLength(26);
      for (let rank = 1; rank <= 13; rank++) {
        expect(group.filter((card) => card.rank === rank)).toHaveLength(2);
      }
    }
  });

  it('id 全局唯一，初始全部背面', () => {
    const deck = createDeck('hard');
    expect(new Set(deck.map((card) => card.id)).size).toBe(104);
    expect(deck.every((card) => !card.faceUp)).toBe(true);
  });

  it('洗牌：同一随机种子结果一致，且是原数组的排列', () => {
    const deck = createDeck('easy');
    const first = shuffle(deck, mulberry32(42));
    const second = shuffle(deck, mulberry32(42));
    expect(first.map((card) => card.id)).toEqual(second.map((card) => card.id));
    expect(new Set(first.map((card) => card.id))).toEqual(new Set(deck.map((card) => card.id)));
  });

  it('shuffle 不修改入参数组', () => {
    const deck = createDeck('easy');
    const order = deck.map((card) => card.id);
    shuffle(deck, mulberry32(1));
    expect(deck.map((card) => card.id)).toEqual(order);
  });
});

describe('cards：显示工具', () => {
  it('rankLabel 覆盖 A-K 且越界有兜底', () => {
    expect(rankLabel(1)).toBe('A');
    expect(rankLabel(10)).toBe('10');
    expect(rankLabel(11)).toBe('J');
    expect(rankLabel(12)).toBe('Q');
    expect(rankLabel(13)).toBe('K');
    expect(rankLabel(14)).toBe('?');
  });

  it('isRedSuit 只认红桃与方块', () => {
    expect(isRedSuit('hearts')).toBe(true);
    expect(isRedSuit('diamonds')).toBe(true);
    expect(isRedSuit('spades')).toBe(false);
    expect(isRedSuit('clubs')).toBe(false);
  });

  it('花色符号齐全', () => {
    expect(SUIT_SYMBOLS.spades).toBe('♠');
    expect(SUIT_SYMBOLS.hearts).toBe('♥');
    expect(SUIT_SYMBOLS.diamonds).toBe('♦');
    expect(SUIT_SYMBOLS.clubs).toBe('♣');
  });
});
