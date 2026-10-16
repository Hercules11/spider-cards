import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { Button, Tooltip } from 'ant-design-vue';
import { createI18n } from 'vue-i18n';
import CardView from '@/components/CardView.vue';
import StatsBar from '@/components/StatsBar.vue';
import zh from '@/lang/zh.json';
import type { Card, Suit } from '@/types';

function card(partial: Partial<Card>): Card {
  return { id: 'c1', suit: 'spades', rank: 1, faceUp: true, ...partial };
}

const i18n = createI18n({ locale: 'zh', fallbackLocale: 'en', messages: { zh } });

function renderStatsBar(props: Record<string, unknown>) {
  return render(StatsBar, {
    props: {
      score: 500,
      moves: 0,
      seconds: 0,
      completed: [],
      deals: 5,
      canUndo: false,
      stockHint: false,
      ...props
    },
    global: { plugins: [i18n, Button, Tooltip] }
  });
}

describe('CardView', () => {
  it('正面牌显示点数与花色', () => {
    const { container } = render(CardView, { props: { card: card({ rank: 13 }) } });
    expect(screen.getAllByText('K').length).toBe(2);
    // 两个角标各一个花色符号 + 中心大符号
    expect(screen.getAllByText('♠').length).toBe(3);
    expect(container.querySelector('.card')).not.toHaveClass('is-down');
  });

  it('红桃花色带 is-red 类', () => {
    const { container } = render(CardView, {
      props: { card: card({ suit: 'hearts', rank: 7 }) }
    });
    expect(container.querySelector('.card')).toHaveClass('is-red');
    expect(screen.getAllByText('♥').length).toBeGreaterThan(0);
  });

  it('背面牌不显示点数', () => {
    const { container } = render(CardView, {
      props: { card: card({ faceUp: false }) }
    });
    expect(container.querySelector('.card')).toHaveClass('is-down');
    expect(screen.queryByText('A')).not.toBeInTheDocument();
  });
});

describe('StatsBar', () => {
  it('展示分数、步数、时间与剩余发牌次数', () => {
    renderStatsBar({ score: 480, moves: 12, seconds: 65, deals: 3 });
    expect(screen.getByText('480')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(screen.getByTestId('stock-count')).toHaveTextContent('×3');
  });

  it('完成槽位按已完成花色显示', () => {
    const { container } = renderStatsBar({ completed: ['spades', 'hearts'] as Suit[] });
    expect(container.querySelectorAll('.slot')).toHaveLength(8);
    expect(container.querySelectorAll('.slot.filled')).toHaveLength(2);
    expect(container.querySelector('.slot.red')).not.toBeNull();
  });

  it('撤销按钮按可用状态禁用，发牌堆点击抛出 deal 事件', async () => {
    const first = renderStatsBar({ canUndo: false });
    expect(screen.getByRole('button', { name: /撤销/ })).toBeDisabled();
    first.unmount();

    const { emitted } = renderStatsBar({ canUndo: true });
    await fireEvent.click(screen.getByRole('button', { name: /撤销/ }));
    expect(emitted('undo')).toHaveLength(1);

    await fireEvent.click(screen.getByTestId('stock'));
    expect(emitted('deal')).toHaveLength(1);
  });
});
