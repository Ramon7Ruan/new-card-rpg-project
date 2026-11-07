import { getConsumable, MAX_CONSUMABLES } from './consumables';
import { initialHandLevels } from './hands';
import { HAND_SIZE, SAVE_VERSION } from './run';
import type { BlindRule, ConsumableInstance, RunState, ShopKind, ShopOffer, ShopState } from './types';

const KEY = 'new-card-rpg-project-run-v1';

/** 旧版存档只有小丑商品，缺 kind 的一律按 joker 补 */
function migrateShop(raw: unknown): ShopState | null {
  if (!raw || typeof raw !== 'object') return null;
  const shop = raw as Partial<ShopState>;
  if (!Array.isArray(shop.offers)) return null;

  const offers: ShopOffer[] = shop.offers
    .filter((o) => o && typeof o.defId === 'string')
    .map((o) => ({
      defId: o.defId,
      kind: (o.kind === 'consumable' ? 'consumable' : 'joker') as ShopKind,
      cost: typeof o.cost === 'number' ? o.cost : 0,
      sold: !!o.sold,
    }));

  return {
    offers,
    rerollCost: typeof shop.rerollCost === 'number' ? shop.rerollCost : 5,
    rerolls: typeof shop.rerolls === 'number' ? shop.rerolls : 0,
  };
}

/** 缺某种牌型的等级时补 1，避免 baseFor(undefined) 类的 NaN */
function migrateLevels(raw: unknown): RunState['handLevels'] {
  const out = initialHandLevels();
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const type of Object.keys(out) as (keyof typeof out)[]) {
    const v = src[type];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1) out[type] = Math.floor(v);
  }
  return out;
}

/**
 * 消耗品槽迁移：丢弃结构不对的条目，也丢弃 defId 已不存在的条目——
 * 否则改名/删条目后，渲染时会拿到 undefined 而白屏。
 */
function migrateConsumables(raw: unknown): ConsumableInstance[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ConsumableInstance[])
    .filter((c) => c && typeof c.uid === 'string' && typeof c.defId === 'string')
    .filter((c) => !!getConsumable(c.defId))
    .slice(0, MAX_CONSUMABLES);
}

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
    handLevels: migrateLevels(s.handLevels),
    consumables: migrateConsumables(s.consumables),
    shop: migrateShop(s.shop),
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
