import type { HandType } from './types';

export const HAND_LABEL: Record<HandType, string> = {
  highCard: '高牌',
  pair: '对子',
  twoPair: '两对',
  threeOfAKind: '三条',
  straight: '顺子',
  flush: '同花',
  fullHouse: '葫芦',
  fourOfAKind: '四条',
  straightFlush: '同花顺',
  fiveOfAKind: '五条',
  flushHouse: '同花葫芦',
  flushFive: '同花五',
};

/** 1 级基础值。数值属玩法机制，可照搬。 */
export const HAND_BASE: Record<HandType, { chips: number; mult: number }> = {
  highCard: { chips: 5, mult: 1 },
  pair: { chips: 10, mult: 2 },
  twoPair: { chips: 20, mult: 2 },
  threeOfAKind: { chips: 30, mult: 3 },
  straight: { chips: 30, mult: 4 },
  flush: { chips: 35, mult: 4 },
  fullHouse: { chips: 40, mult: 4 },
  fourOfAKind: { chips: 60, mult: 7 },
  straightFlush: { chips: 100, mult: 8 },
  fiveOfAKind: { chips: 120, mult: 12 },
  flushHouse: { chips: 140, mult: 14 },
  flushFive: { chips: 160, mult: 16 },
};

export const ALL_HAND_TYPES = Object.keys(HAND_BASE) as HandType[];

/**
 * 等级恒为 1 时直接返回基础值。
 * M1 接星球牌时，在这里按牌型叠加每级增量（各牌型增量不同，需查表）。
 */
export function baseFor(type: HandType, level: number): { chips: number; mult: number } {
  const base = HAND_BASE[type];
  if (level <= 1) return { chips: base.chips, mult: base.mult };
  return { chips: base.chips, mult: base.mult };
}

export function initialHandLevels(): Record<HandType, number> {
  const out = {} as Record<HandType, number>;
  for (const t of ALL_HAND_TYPES) out[t] = 1;
  return out;
}
