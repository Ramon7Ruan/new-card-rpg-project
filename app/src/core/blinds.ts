export const BLIND_NAMES = ['小盲注', '大盲注', 'Boss 盲注'] as const;
export const BLIND_REWARDS = [3, 4, 5] as const;

/**
 * M0 只做 1 个底注，3 个盲注（第三个是不带 debuff 的 Boss 位）。
 * M1 扩展时在这里加底注行即可，状态机不需要改。
 */
export const ANTE_TARGETS: number[][] = [[300, 450, 600]];

export function targetFor(ante: number, blindIndex: number): number {
  const row = ANTE_TARGETS[Math.min(Math.max(ante - 1, 0), ANTE_TARGETS.length - 1)];
  return row[Math.min(Math.max(blindIndex, 0), 2)];
}

export function rewardFor(blindIndex: number): number {
  return BLIND_REWARDS[Math.min(Math.max(blindIndex, 0), 2)];
}
