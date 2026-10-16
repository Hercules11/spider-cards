import type { Card, GameState } from '@/types';

/** 牌桌列数 */
export const COLUMN_COUNT = 10;
/** 每次发牌每列各 1 张 */
export const DEAL_SIZE = 10;
/** 一局共 5 次发牌（50 张） */
export const DEALS_TOTAL = 5;
/** 完成一组同花顺需要 13 张（K→A） */
export const COMPLETE_RUN_LENGTH = 13;
/** 集齐 8 组即获胜 */
export const WINS_NEEDED = 8;
/** 初始分数 */
export const START_SCORE = 500;
/** 每完成一组同花顺的加分 */
export const COMPLETE_SCORE = 100;

/**
 * 取从 index 起可以整体移动的牌组：
 * 起点必须正面；向后延伸直到花色变化或点数不连续为止。
 * 注意这是「前缀」语义——9♠8♠7♥ 里点 9♠ 只能带走 9♠8♠；
 * 不允许拆开同花顺中的一段（如只移动 9♠ 而不带 8♠），与经典规则一致
 */
export function getMovableRun(column: readonly Card[], index: number): Card[] | null {
  const first = column[index];
  if (!first || !first.faceUp) {
    return null;
  }
  const run: Card[] = [first];
  for (let i = index + 1; i < column.length; i++) {
    const prev = column[i - 1]!;
    const current = column[i]!;
    if (!current.faceUp || current.suit !== prev.suit || current.rank !== prev.rank - 1) {
      break;
    }
    run.push(current);
  }
  return run;
}

/** 目标列能否接收 run：空列可以，否则顶牌必须比 run 首牌大 1（不限花色） */
export function canDropOn(targetTop: Card | undefined, run: readonly Card[]): boolean {
  const head = run[0];
  if (!head) {
    return false;
  }
  if (!targetTop) {
    return true;
  }
  return targetTop.faceUp && targetTop.rank === head.rank + 1;
}

/** 列尾是否形成了完整的 K→A 同花顺（13 张、全部正面、同花色递减） */
export function hasCompleteRun(column: readonly Card[]): boolean {
  if (column.length < COMPLETE_RUN_LENGTH) {
    return false;
  }
  const start = column.length - COMPLETE_RUN_LENGTH;
  for (let offset = 0; offset < COMPLETE_RUN_LENGTH; offset++) {
    const card = column[start + offset]!;
    if (!card.faceUp || card.rank !== COMPLETE_RUN_LENGTH - offset) {
      return false;
    }
    if (offset > 0 && card.suit !== column[start + offset - 1]!.suit) {
      return false;
    }
  }
  return true;
}

/** 发牌条件：没有空列、还有一次完整发牌、且局面未结束 */
export function canDeal(state: GameState): boolean {
  return (
    state.status === 'playing' &&
    state.stock.length >= DEAL_SIZE &&
    state.columns.every((column) => column.length > 0)
  );
}
