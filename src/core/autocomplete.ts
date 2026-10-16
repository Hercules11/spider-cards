import type { Card, CardMove, GameState, Suit } from '@/types';
import {
  canDropOn,
  COMPLETE_RUN_LENGTH,
  getMovableRun,
  hasCompleteRun,
  WINS_NEEDED
} from './rules';

export interface SolveOptions {
  /** 搜索节点上限（超出即放弃，返回 timeout） */
  maxNodes?: number;
  /** 时间上限（毫秒） */
  timeMs?: number;
}

export interface SolveResult {
  status: 'solved' | 'unsolvable' | 'timeout';
  /** 求解出的移动序列（status === 'solved' 时有效） */
  moves: CardMove[];
  /** 实际展开的搜索节点数（诊断用） */
  nodes: number;
}

const SUIT_CODES: Record<Suit, string> = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' };

/**
 * 是否「全牌面呈现」：牌堆已空、桌面所有牌都正面朝上。
 * 此时局面完全确定，可以展示「自动完成」按钮
 */
export function isFullyRevealed(state: GameState): boolean {
  return (
    state.status === 'playing' &&
    state.stock.length === 0 &&
    state.columns.every((column) => column.every((card) => card.faceUp))
  );
}

interface Position {
  columns: Card[][];
  collected: number;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** 局面规范化编码（用于搜索去重）：列内容 + 已收组数 */
function stateKey(position: Position): string {
  let key = `${position.collected}`;
  for (const column of position.columns) {
    key += '|';
    for (const card of column) {
      key += card.rank;
      key += card.faceUp ? '+' : '-';
      key += SUIT_CODES[card.suit];
    }
  }
  return key;
}

/**
 * 在搜索中应用一次移动（与引擎 moveCards 语义一致，但不计分）：
 * 复制受影响列、移动牌组、自动翻开露出的背面牌、结算收牌。
 * 非法移动返回 null
 */
function applyMove(position: Position, move: CardMove): Position | null {
  const source = position.columns[move.from];
  const target = position.columns[move.to];
  if (!source || !target || move.from === move.to) {
    return null;
  }
  const run = getMovableRun(source, move.index);
  if (!run || !canDropOn(target[target.length - 1], run)) {
    return null;
  }
  const columns = position.columns.map((column) => column.slice());
  const nextSource = columns[move.from]!;
  const nextTarget = columns[move.to]!;
  nextTarget.push(...nextSource.splice(move.index));
  // 露出背面牌则翻开（写时复制，不修改共享的牌对象）
  const revealed = nextSource[nextSource.length - 1];
  if (revealed && !revealed.faceUp) {
    nextSource[nextSource.length - 1] = { ...revealed, faceUp: true };
  }
  // 结算所有列尾已完成的 K→A 同花顺
  let collected = position.collected;
  outer: for (const column of columns) {
    while (hasCompleteRun(column)) {
      column.splice(column.length - COMPLETE_RUN_LENGTH);
      collected += 1;
      const below = column[column.length - 1];
      if (below && !below.faceUp) {
        column[column.length - 1] = { ...below, faceUp: true };
      }
      if (collected >= WINS_NEEDED) {
        break outer;
      }
    }
  }
  return { columns, collected };
}

interface Candidate {
  move: CardMove;
  score: number;
}

/** 目标列顶部同花顺链条长度（从顶牌向下连续同花递减的张数） */
function sameSuitChainFromTop(column: readonly Card[]): number {
  const top = column[column.length - 1];
  if (!top || !top.faceUp) {
    return 0;
  }
  let length = 1;
  for (let i = column.length - 2; i >= 0; i--) {
    const card = column[i]!;
    const below = column[i + 1]!;
    if (card.faceUp && card.suit === below.suit && card.rank === below.rank + 1) {
      length += 1;
    } else {
      break;
    }
  }
  return length;
}

/**
 * 单步启发式评分（越高越先尝试）：
 * 直接凑成 K→A 收牌 >> 同花延续/合流 > 露出背面牌 > 清空来源列 > 整合长序列，
 * 拆开同花链、搬进空列等低收益动作降权
 */
function scoreMove(
  column: readonly Card[],
  index: number,
  run: readonly Card[],
  target: readonly Card[]
): number {
  const head = run[0]!;
  const top = target[target.length - 1];
  let score = run.length * 3;

  // 落牌后直接收走一组
  if (top && hasCompleteRun([...target, ...run])) {
    score += 100000;
  }
  if (top && top.suit === head.suit) {
    // 同花延续：目标顶部同花链越长越值得合流
    score += 300 + sameSuitChainFromTop(target) * 40;
  }
  if (index > 0) {
    const above = column[index - 1]!;
    if (!above.faceUp) {
      score += 60;
    } else if (above.suit === head.suit && above.rank === head.rank + 1) {
      // 拆开一段同花链，通常是坏棋
      score -= 80;
    }
  } else {
    // 整列搬走 → 腾出一个空列
    score += 50;
  }
  if (!top) {
    // 空列落点只是中转，降权
    score -= 40;
  }
  return score;
}

/** 生成当前局面的全部候选移动（已按启发式评分降序） */
function generateMoves(position: Position): Candidate[] {
  const { columns } = position;
  const firstEmpty = columns.findIndex((column) => column.length === 0);
  const candidates: Candidate[] = [];
  for (let from = 0; from < columns.length; from++) {
    const column = columns[from]!;
    if (column.length === 0) {
      continue;
    }
    for (let index = 0; index < column.length; index++) {
      if (!column[index]!.faceUp) {
        continue;
      }
      const run = getMovableRun(column, index);
      if (!run) {
        continue;
      }
      for (let to = 0; to < columns.length; to++) {
        if (to === from) {
          continue;
        }
        const target = columns[to]!;
        const top = target[target.length - 1];
        if (!canDropOn(top, run)) {
          continue;
        }
        if (!top) {
          // 空列彼此等价：只考虑第一个空列；整列搬空列是原地打转，排除
          if (to !== firstEmpty || index === 0) {
            continue;
          }
        }
        candidates.push({
          move: { from, index, to },
          score: scoreMove(column, index, run, target)
        });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * 求解「全明牌」局面的收尾方案：带记忆化的深度优先搜索 + 启发式排序。
 * 找到完整胜利序列返回 solved；搜索空间穷尽仍无解返回 unsolvable；
 * 超出节点/时间预算返回 timeout
 */
export function solveGame(state: GameState, options: SolveOptions = {}): SolveResult {
  const maxNodes = options.maxNodes ?? 60_000;
  const timeMs = options.timeMs ?? 2500;
  const start: Position = {
    columns: state.columns.map((column) => column.slice()),
    collected: state.completed.length
  };
  if (start.collected >= WINS_NEEDED) {
    return { status: 'solved', moves: [], nodes: 0 };
  }

  const visited = new Set<string>();
  const deadline = nowMs() + timeMs;
  let nodes = 0;
  let aborted = false;

  const search = (position: Position): CardMove[] | null => {
    if (position.collected >= WINS_NEEDED) {
      return [];
    }
    const key = stateKey(position);
    if (visited.has(key)) {
      return null;
    }
    visited.add(key);
    for (const candidate of generateMoves(position)) {
      nodes += 1;
      if (nodes >= maxNodes || (nodes % 64 === 0 && nowMs() > deadline)) {
        aborted = true;
        return null;
      }
      const next = applyMove(position, candidate.move);
      if (!next) {
        continue;
      }
      const rest = search(next);
      if (rest) {
        return [candidate.move, ...rest];
      }
      if (aborted) {
        return null;
      }
    }
    return null;
  };

  const moves = search(start);
  if (moves) {
    return { status: 'solved', moves, nodes };
  }
  return { status: aborted ? 'timeout' : 'unsolvable', moves: [], nodes };
}
