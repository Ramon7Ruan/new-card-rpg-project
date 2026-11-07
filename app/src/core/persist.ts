import { HAND_SIZE, SAVE_VERSION } from './run';
import type { BlindRule, RunState } from './types';

const KEY = 'new-card-rpg-project-run-v1';

/**
 * 把任意来源的存档对象补齐成当前版本。
 * 规则：只补缺省字段，不做语义转换——旧存档打到一半的 Boss 盲注会保留当时的
 * target，不重新套用规则（那个版本还没有规则）。
 */
export function migrateSave(raw: unknown): RunState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;

  if (typeof s.seed !== 'string') return null;
  if (!Array.isArray(s.hand) || !Array.isArray(s.deck)) return null;
  if (typeof s.ante !== 'number' || typeof s.blindIndex !== 'number') return null;

  const state = s as unknown as RunState;
  return {
    ...state,
    version: SAVE_VERSION,
    bossId: typeof s.bossId === 'string' ? s.bossId : null,
    bossRule: (s.bossRule as BlindRule | null | undefined) ?? null,
    handSize: typeof s.handSize === 'number' ? s.handSize : HAND_SIZE,
    lastScore: state.lastScore ?? null,
    selected: Array.isArray(s.selected) ? (s.selected as string[]) : [],
  };
}

export function saveRun(state: RunState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 存储不可用时静默失败 */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
