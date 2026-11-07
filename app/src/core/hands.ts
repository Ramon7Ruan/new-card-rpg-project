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
 * 每升 1 级的增量。数值为自定（非原版照搬），只保证「稀有牌型升级收益更高」。
 * 这张表同时决定铭文（星球位）值不值得买，以及后续目标曲线的强度。
 */
export const HAND_LEVEL_GAIN: Record<HandType, { chips: number; mult: number }> = {
  highCard: { chips: 12, mult: 1 },
  pair: { chips: 18, mult: 1 },
  twoPair: { chips: 22, mult: 1 },
  threeOfAKind: { chips: 25, mult: 2 },
  straight: { chips: 30, mult: 3 },
  flush: { chips: 18, mult: 2 },
  fullHouse: { chips: 28, mult: 2 },
  fourOfAKind: { chips: 32, mult: 3 },
  straightFlush: { chips: 42, mult: 4 },
  fiveOfAKind: { chips: 36, mult: 3 },
  flushHouse: { chips: 42, mult: 4 },
  flushFive: { chips: 42, mult: 4 },
};

/**
 * 某牌型在指定等级的基础值：`base + gain × (level − 1)`。
 * **1 级必须严格等于 HAND_BASE**，黄金用例锁着这一点。
 */
export function baseFor(type: HandType, level: number): { chips: number; mult: number } {
  const base = HAND_BASE[type];
  const steps = Math.max(0, (Number.isFinite(level) ? level : 1) - 1);
  if (steps === 0) return { chips: base.chips, mult: base.mult };

  const gain = HAND_LEVEL_GAIN[type];
  return { chips: base.chips + gain.chips * steps, mult: base.mult + gain.mult * steps };
}

export function initialHandLevels(): Record<HandType, number> {
  const out = {} as Record<HandType, number>;
  for (const t of ALL_HAND_TYPES) out[t] = 1;
  return out;
}
