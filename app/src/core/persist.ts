import type { RunState } from './types';

const KEY = 'poker-rogue-run-v1';

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
    const parsed = JSON.parse(raw) as Partial<RunState>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.seed !== 'string' || !Array.isArray(parsed.hand)) return null;
    return parsed as RunState;
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
