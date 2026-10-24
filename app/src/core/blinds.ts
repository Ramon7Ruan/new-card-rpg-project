export const BLIND_NAMES = ['小盲注', '大盲注', 'Boss 盲注'] as const;
export const BLIND_REWARDS = [3, 4, 5] as const;

/**
 * 每个底注 3 个盲注，第三个是 Boss 位（M0 暂不带 debuff）。
 * 加底注只需在此追加一行，状态机不需要改。
 */
export const ANTE_TARGETS: number[][] = [
  [300, 450, 600],
  [800, 1200, 1600],
];

/** 一局要打多少个底注 */
export const MAX_ANTE = ANTE_TARGETS.length;

export function targetFor(ante: number, blindIndex: number): number {
  const row = ANTE_TARGETS[Math.min(Math.max(ante - 1, 0), ANTE_TARGETS.length - 1)];
  return row[Math.min(Math.max(blindIndex, 0), 2)];
}

export function rewardFor(blindIndex: number): number {
  return BLIND_REWARDS[Math.min(Math.max(blindIndex, 0), 2)];
}
