import type { CardMove, Card, Difficulty, GameState, Hint } from '@/types';
import { createDeck, shuffle, type RandomFn } from './cards';
import {
  canDeal,
  canDropOn,
  COLUMN_COUNT,
  COMPLETE_RUN_LENGTH,
  COMPLETE_SCORE,
  DEAL_SIZE,
  getMovableRun,
  hasCompleteRun,
  START_SCORE,
  WINS_NEEDED
} from './rules';

/**
 * 深拷贝纯 JSON 游戏状态。
 * 引擎函数全部「写时复制」：不修改入参，返回新状态；历史快照（撤销）直接存克隆体
 */
export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/**
 * 新开一局：洗牌后发 10 列，前 4 列各 6 张、其余各 5 张，
 * 每列只有最后一张翻开，剩余 50 张进牌堆
 */
export function createGame(difficulty: Difficulty, random: RandomFn = Math.random): GameState {
  const deck = shuffle(createDeck(difficulty), random);
  const columns: Card[][] = [];
  let cursor = 0;
  for (let col = 0; col < COLUMN_COUNT; col++) {
    const size = col < 4 ? 6 : 5;
    const cards = deck.slice(cursor, cursor + size).map((card, index, batch) => ({
      ...card,
      faceUp: index === batch.length - 1
    }));
    cursor += size;
    columns.push(cards);
  }
  return {
    difficulty,
    columns,
    stock: deck.slice(cursor),
    completed: [],
    score: START_SCORE,
    moves: 0,
    status: 'playing'
  };
}

/**
 * 结算所有列尾已完成的 K→A 同花顺：整组移出（记录花色）、+100 分、
 * 若新露出的底牌是背面则翻正（与经典 Windows 蜘蛛纸牌的自动翻牌一致），
 * 最后判定是否达到 8 组获胜
 */
function collectCompleted(state: GameState): GameState {
  for (const column of state.columns) {
    while (hasCompleteRun(column)) {
      const removed = column.splice(column.length - COMPLETE_RUN_LENGTH);
      const suit = removed[0]!.suit;
      state.completed.push(suit);
      state.score += COMPLETE_SCORE;
      const revealed = column[column.length - 1];
      if (revealed && !revealed.faceUp) {
        revealed.faceUp = true;
      }
    }
  }
  if (state.completed.length >= WINS_NEEDED) {
    state.status = 'won';
  }
  return state;
}

/** 每步操作统一扣 1 分（下限 0）并累计步数 */
function applyMoveCost(state: GameState): void {
  state.moves += 1;
  state.score = Math.max(0, state.score - 1);
}

/**
 * 把 from 列 index 起的同花顺移到 to 列。
 * 合法性：起点正面、目标能接、不是原列；非法返回 null（调用方保持原状态）
 */
export function moveCards(
  state: GameState,
  from: number,
  index: number,
  to: number
): GameState | null {
  if (state.status !== 'playing' || from === to) {
    return null;
  }
  const source = state.columns[from];
  const target = state.columns[to];
  if (!source || !target) {
    return null;
  }
  const run = getMovableRun(source, index);
  if (!run || !canDropOn(target[target.length - 1], run)) {
    return null;
  }
  const next = cloneState(state);
  const nextSource = next.columns[from]!;
  const nextTarget = next.columns[to]!;
  nextTarget.push(...nextSource.splice(index));
  // 移动后露出背面牌则自动翻开
  const revealed = nextSource[nextSource.length - 1];
  if (revealed && !revealed.faceUp) {
    revealed.faceUp = true;
  }
  applyMoveCost(next);
  return collectCompleted(next);
}

/** 发一排牌：每列各加一张正面牌；有空列或牌堆不足时返回 null */
export function dealRow(state: GameState): GameState | null {
  if (!canDeal(state)) {
    return null;
  }
  const next = cloneState(state);
  const batch = next.stock.splice(0, DEAL_SIZE);
  batch.forEach((card, col) => {
    card.faceUp = true;
    next.columns[col]!.push(card);
  });
  applyMoveCost(next);
  return collectCompleted(next);
}

/** 单次移动的启发式评分：同花延续 > 能翻暗牌 > 普通接牌，移入空列略微降权 */
function scoreMoveCandidate(
  column: readonly Card[],
  index: number,
  run: readonly Card[],
  targetTop: Card | undefined
): number {
  const head = run[0]!;
  let weight = run.length;
  if (targetTop && targetTop.suit === head.suit) {
    weight += 20;
  }
  if (index > 0 && !column[index - 1]!.faceUp) {
    weight += 15;
  }
  if (!targetTop) {
    weight -= 8;
  }
  return weight;
}

/**
 * 提示：穷举所有合法移动取启发式最高分的一处：
 * 没有可用移动但还能发牌时建议发牌；彻底走死返回 null
 */
export function findHint(state: GameState): Hint | null {
  if (state.status !== 'playing') {
    return null;
  }
  let best: { move: CardMove; weight: number } | null = null;
  for (let from = 0; from < state.columns.length; from++) {
    const column = state.columns[from]!;
    const firstFaceUp = column.findIndex((card) => card.faceUp);
    if (firstFaceUp === -1) {
      continue;
    }
    for (let index = firstFaceUp; index < column.length; index++) {
      const run = getMovableRun(column, index);
      if (!run) {
        continue;
      }
      for (let to = 0; to < state.columns.length; to++) {
        if (to === from) {
          continue;
        }
        const targetTop = state.columns[to]![state.columns[to]!.length - 1];
        if (!canDropOn(targetTop, run)) {
          continue;
        }
        // 整列搬到空列等于原地打转，直接排除
        if (!targetTop && index === 0) {
          continue;
        }
        const weight = scoreMoveCandidate(column, index, run, targetTop);
        if (!best || weight > best.weight) {
          best = { move: { from, index, to }, weight };
        }
      }
    }
  }
  if (best) {
    return { kind: 'move', move: best.move };
  }
  if (canDeal(state)) {
    return { kind: 'deal' };
  }
  return null;
}

/**
 * 单击自动移动（快捷移动）：在合法目标中优先同花延续、其次能翻暗牌，
 * 最后才用空列（且需能翻牌）；找不到落点返回 null
 */
export function findAutoMove(
  columns: readonly Card[][],
  from: number,
  index: number
): CardMove | null {
  const source = columns[from];
  if (!source) {
    return null;
  }
  const run = getMovableRun(source, index);
  if (!run) {
    return null;
  }
  const head = run[0]!;
  let best: { move: CardMove; weight: number } | null = null;
  for (let to = 0; to < columns.length; to++) {
    if (to === from) {
      continue;
    }
    const targetTop = columns[to]![columns[to]!.length - 1];
    if (!canDropOn(targetTop, run)) {
      continue;
    }
    const revealsFaceDown = index > 0 && !source[index - 1]!.faceUp;
    // 空列只接受能翻出暗牌的移动，避免来回搬牌
    if (!targetTop && !revealsFaceDown) {
      continue;
    }
    let weight = 0;
    if (targetTop) {
      weight += 10;
    }
    if (targetTop && targetTop.suit === head.suit) {
      weight += 30;
    }
    if (revealsFaceDown) {
      weight += 12;
    }
    if (!best || weight > best.weight) {
      best = { move: { from, index, to }, weight };
    }
  }
  return best ? best.move : null;
}

/** 剩余发牌次数（牌堆 50 张 = 5 次） */
export function dealsLeft(state: GameState): number {
  return Math.floor(state.stock.length / DEAL_SIZE);
}
