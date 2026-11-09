import { ANTE_TARGETS } from './blinds';

/**
 * 难度（P5）：只调两件事——这一局要打多少个底注、Boss 位目标乘多少。
 * 小盲/大盲不受影响：难度应该加在「关键关卡」上，而不是把所有数字一起抬高。
 */

export type DifficultyId = 'casual' | 'normal' | 'challenge' | 'hell';

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  desc: string;
  /** 这一局要打几个底注 */
  antes: number;
  /** Boss 位目标系数 */
  bossScale: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  { id: 'casual', name: '轻松', desc: 'Boss 目标不打折也不加码', antes: 4, bossScale: 1 },
  { id: 'normal', name: '普通', desc: '标准体验', antes: 5, bossScale: 1 },
  { id: 'challenge', name: '挑战', desc: 'Boss 目标 ×1.15', antes: 6, bossScale: 1.15 },
  { id: 'hell', name: '地狱', desc: 'Boss 目标 ×1.3，打满整条曲线', antes: 8, bossScale: 1.3 },
];

export const DEFAULT_DIFFICULTY: DifficultyId = 'normal';

const BY_ID = new Map<string, DifficultyDef>(DIFFICULTIES.map((d) => [d.id, d]));

export function getDifficulty(id: string): DifficultyDef | undefined {
  return BY_ID.get(id);
}

export function isDifficultyId(id: unknown): id is DifficultyId {
  return typeof id === 'string' && BY_ID.has(id);
}

/** 难度对应的底注数，夹在目标表的范围内 */
export function antesFor(id: DifficultyId): number {
  const def = getDifficulty(id) ?? DIFFICULTIES[1];
  return Math.min(def.antes, ANTE_TARGETS.length);
}

/**
 * 一次盲注的最终目标。**这是全项目唯一的目标计算入口**：
 * run.ts 与界面预览都调它，避免「界面上写 300、真打起来是 345」。
 */
export function scaledTarget(
  baseTarget: number,
  blindIndex: number,
  difficulty: DifficultyId,
  bossMultiplier = 1,
): number {
  if (blindIndex < 2) return baseTarget;
  const def = getDifficulty(difficulty) ?? DIFFICULTIES[1];
  return Math.round(baseTarget * bossMultiplier * def.bossScale);
}
