import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectScope, nextTick, type EffectScope } from 'vue';
import { useGame } from '@/composables/useGame';
import { readJSON, STORAGE_KEYS } from '@/utils/storage';
import type { GameState } from '@/types';
import { makeState, testCard, twelveDownToTwo } from './helpers';

/** 在独立的 effectScope 中运行 useGame（组件外调用 composable 的正确姿势） */
function createGameScope() {
  const scope = effectScope();
  const game = scope.run(() => useGame())!;
  return { scope, game };
}

let scopes: EffectScope[] = [];

function openGame() {
  const created = createGameScope();
  scopes.push(created.scope);
  return created.game;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  scopes.forEach((scope) => scope.stop());
  scopes = [];
});

describe('useGame：开局与操作', () => {
  it('无存档时没有进行中的对局', () => {
    const game = openGame();
    expect(game.hasGame.value).toBe(false);
  });

  it('开局后可发牌，撤销回退到开局状态', () => {
    const game = openGame();
    game.startNewGame('easy');
    expect(game.hasGame.value).toBe(true);
    expect(game.canUndo.value).toBe(false);
    expect(game.dealsLeft.value).toBe(5);

    expect(game.deal()).toBeNull();
    expect(game.state.value!.moves).toBe(1);
    expect(game.dealsLeft.value).toBe(4);
    expect(game.canUndo.value).toBe(true);

    expect(game.undo()).toBe(true);
    expect(game.state.value!.moves).toBe(0);
    expect(game.dealsLeft.value).toBe(5);
    expect(game.canUndo.value).toBe(false);
  });

  it('发牌失败返回原因：空列 / 无牌可发', () => {
    const game = openGame();
    game.startNewGame('easy');
    game.state.value!.columns[0] = [];
    expect(game.deal()).toBe('empty-column');

    game.state.value!.columns[0] = [testCard('spades', 5)];
    game.state.value!.stock = [];
    expect(game.deal()).toBe('no-deals');
  });

  it('移动：合法成功、非法返回 false 且状态不变', () => {
    const game = openGame();
    game.startNewGame('easy');
    game.state.value = makeState({
      columns: [[testCard('spades', 9)], [testCard('clubs', 10)]]
    });
    expect(game.move(0, 0, 1)).toBe(true);
    expect(game.state.value!.columns[1]!.map((card) => card.rank)).toEqual([10, 9]);

    game.state.value = makeState({
      columns: [[testCard('spades', 9)], [testCard('clubs', 8)]]
    });
    expect(game.move(0, 0, 1)).toBe(false);
    expect(game.state.value!.columns[1]).toHaveLength(1);
  });

  it('自动移动与提示透传', () => {
    const game = openGame();
    game.startNewGame('easy');
    game.state.value = makeState({
      columns: [[testCard('spades', 9)], [testCard('spades', 10)]]
    });
    expect(game.autoMove(0, 0)).toBe(true);
    expect(game.state.value!.columns[1]!.map((card) => card.rank)).toEqual([10, 9]);

    game.state.value = makeState({
      columns: [[testCard('spades', 9)], [testCard('spades', 10)]]
    });
    expect(game.hint()).toEqual({ kind: 'move', move: { from: 0, index: 0, to: 1 } });
  });
});

describe('useGame：持久化与统计', () => {
  it('牌局写入存档，新会话可恢复', () => {
    const first = openGame();
    first.startNewGame('hard');
    first.deal();
    const saved = readJSON<{ elapsedSeconds: number } | null>(STORAGE_KEYS.savedGame, null);
    expect(saved).not.toBeNull();

    const second = openGame();
    expect(second.hasGame.value).toBe(true);
    expect(second.state.value!.difficulty).toBe('hard');
    expect(second.state.value!.moves).toBe(1);
    expect(second.dealsLeft.value).toBe(4);
    // 历史不落盘：恢复后不可撤销
    expect(second.canUndo.value).toBe(false);
  });

  it('获胜时记录最佳成绩，恢复已获胜的存档不重复统计', async () => {
    const game = openGame();
    game.startNewGame('easy');
    const wonState: GameState = makeState({
      difficulty: 'easy',
      completed: Array.from({ length: 7 }, () => 'spades' as const),
      columns: [
        [testCard('spades', 1)],
        twelveDownToTwo('spades'),
        ...Array.from({ length: 8 }, () => [] as ReturnType<typeof testCard>[])
      ]
    });
    game.state.value = wonState;
    expect(game.move(0, 0, 1)).toBe(true);
    await nextTick();

    expect(game.state.value!.status).toBe('won');
    expect(game.stats.value.easy.gamesWon).toBe(1);
    expect(game.stats.value.easy.bestScore).toBe(599);
    expect(game.stats.value.easy.bestMoves).toBe(1);

    // 新会话恢复已获胜存档：不再累加统计
    const restored = openGame();
    expect(restored.isWon.value).toBe(true);
    await nextTick();
    expect(restored.stats.value.easy.gamesWon).toBe(1);
  });

  it('resetAll 清空存档与成绩', () => {
    const game = openGame();
    game.startNewGame('medium');
    game.resetAll();
    expect(game.hasGame.value).toBe(false);
    expect(readJSON(STORAGE_KEYS.savedGame, null)).toBeNull();
    expect(readJSON(STORAGE_KEYS.stats, null)).toBeNull();
    expect(game.stats.value.medium.gamesWon).toBe(0);
  });
});
