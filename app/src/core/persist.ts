import { getConsumable, MAX_CONSUMABLES } from './consumables';
import { initialHandLevels } from './hands';
import { getJoker } from './jokers';
import { getPack } from './packs';
import { getTag } from './tags';
import { HAND_SIZE, SAVE_VERSION } from './run';
import { getVoucher } from './vouchers';
import type {
  BlindRule,
  Card,
  ConsumableInstance,
  Enhancement,
  PackChoice,
  PackState,
  RunState,
  Seal,
  ShopKind,
  ShopOffer,
  ShopState,
  Suit,
} from './types';

const KEY = 'new-card-rpg-project-run-v1';

const SUITS = new Set<string>(['spade', 'heart', 'diamond', 'club']);
const ENHANCEMENTS = new Set<string>(['bonus', 'mult', 'glass', 'steel', 'gold', 'wild']);
const SEALS = new Set<string>(['red', 'gold']);

/**
 * 单张牌的迁移：v3 及更早的牌没有 enhancement / seal，缺省即普通牌。
 * 非法字段一律丢弃而不是保留——未知增强名会让计分拿到 undefined 分支。
 */
export function sanitizeCard(raw: unknown): Card | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<Card>;
  if (typeof c.id !== 'string' || c.id === '') return null;
  if (typeof c.suit !== 'string' || !SUITS.has(c.suit)) return null;
  if (typeof c.rank !== 'number' || !Number.isFinite(c.rank)) return null;
  if (c.rank < 2 || c.rank > 14) return null;

  const out: Card = { id: c.id, suit: c.suit as Suit, rank: Math.floor(c.rank) };
  if (typeof c.enhancement === 'string' && ENHANCEMENTS.has(c.enhancement)) {
    out.enhancement = c.enhancement as Enhancement;
  }
  if (typeof c.seal === 'string' && SEALS.has(c.seal)) {
    out.seal = c.seal as Seal;
  }
  return out;
}

function migrateCards(raw: unknown): Card[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeCard).filter((c): c is Card => c !== null);
}

/** 旧版存档只有一条扁平的商品列表（带 kind），v5 起拆成两个货架 */
function migrateShop(raw: unknown): ShopState | null {
  if (!raw || typeof raw !== 'object') return null;
  const shop = raw as Partial<ShopState> & { offers?: unknown };
  const hasSplit = Array.isArray(shop.jokers) || Array.isArray(shop.consumables);
  const hasLegacy = Array.isArray(shop.offers);
  if (!hasSplit && !hasLegacy) return null;

  let legacyJokers: unknown = shop.jokers;
  let legacyConsumables: unknown = shop.consumables;

  if (!hasSplit && hasLegacy) {
    // v4 及更早：{ offers: [{ defId, kind, cost, sold }] }
    const all = (shop.offers as { defId?: string; kind?: string }[]).filter(
      (o) => o && typeof o.defId === 'string',
    );
    legacyJokers = all.filter((o) => o.kind !== 'consumable');
    legacyConsumables = all.filter((o) => o.kind === 'consumable');
  }

  return {
    jokers: migrateOffers(legacyJokers, 'joker'),
    consumables: migrateOffers(legacyConsumables, 'consumable'),
    voucher: migrateVoucher(shop.voucher),
    packs: migratePacks(shop.packs),
    rerollCost: typeof shop.rerollCost === 'number' ? shop.rerollCost : 5,
    rerolls: typeof shop.rerolls === 'number' ? shop.rerolls : 0,
  };
}

/** 补充包货位：认不出的包直接丢掉 */
function migratePacks(raw: unknown): ShopOffer[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopOffer[] = [];
  for (const item of raw as Partial<ShopOffer>[]) {
    if (!item || typeof item.defId !== 'string') continue;
    const def = getPack(item.defId);
    if (!def) continue;
    out.push({
      defId: item.defId,
      cost: typeof item.cost === 'number' ? item.cost : def.cost,
      sold: !!item.sold,
    });
  }
  return out;
}

/**
 * 开着的包。刷新页面时包必须还在——候选是纯数据，牌是 Card（sanitize 过），
 * 只要候选全坏掉就当没开过包，避免弹一个空面板。
 */
function migratePack(raw: unknown): PackState | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<PackState>;
  if (!Array.isArray(p.choices)) return null;

  const choices: PackChoice[] = [];
  for (const c of p.choices as PackChoice[]) {
    if (!c || typeof c !== 'object') continue;
    if (c.kind === 'joker' && typeof c.defId === 'string' && getJoker(c.defId)) {
      choices.push({ kind: 'joker', defId: c.defId });
    } else if (
      c.kind === 'consumable' &&
      typeof c.defId === 'string' &&
      getConsumable(c.defId)
    ) {
      choices.push({ kind: 'consumable', defId: c.defId });
    } else if (c.kind === 'card') {
      const card = sanitizeCard(c.card);
      if (card) choices.push({ kind: 'card', card });
    }
  }

  if (choices.length === 0) return null;
  return {
    packId: typeof p.packId === 'string' && getPack(p.packId) ? p.packId : 'pack-standard',
    choices,
  };
}

/** 优惠券货位：id 不存在就当没挂券，避免渲染出一个空卡片 */
function migrateVoucher(raw: unknown): ShopOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<ShopOffer>;
  if (typeof o.defId !== 'string') return null;
  const def = getVoucher(o.defId);
  if (!def) return null;
  return {
    defId: o.defId,
    cost: typeof o.cost === 'number' ? o.cost : def.cost,
    sold: !!o.sold,
  };
}

/** 已购优惠券：只保留认得出来的、去重。旧存档没有这个字段 → [] */
function migrateVouchers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== 'string' || !getVoucher(id)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * 货架商品迁移：扔掉结构不对的、以及 defId 已经不存在的条目。
 * 后者是 P1 留下的老问题——删条目/改名后货架上会留一格空白或渲染白屏。
 */
function migrateOffers(raw: unknown, kind: ShopKind): ShopOffer[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopOffer[] = [];
  for (const item of raw as Partial<ShopOffer>[]) {
    if (!item || typeof item.defId !== 'string') continue;
    const def = kind === 'joker' ? getJoker(item.defId) : getConsumable(item.defId);
    if (!def) continue;
    out.push({
      defId: item.defId,
      cost: typeof item.cost === 'number' ? item.cost : def.cost,
      sold: !!item.sold,
    });
  }
  return out;
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

/** 标签历史：只留认得出的，去重 */
function migrateTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== 'string' || !getTag(id)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
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
    pack: migratePack(s.pack),
    packSeq: typeof s.packSeq === 'number' && s.packSeq >= 0 ? Math.floor(s.packSeq) : 0,
    // v5 → 优惠券 / 标签：旧存档没有这些字段，等价于「一张都没买、没跳过」
    vouchers: migrateVouchers(s.vouchers),
    tags: migrateTags(s.tags),
    freeRerolls:
      typeof s.freeRerolls === 'number' && s.freeRerolls >= 0 ? Math.floor(s.freeRerolls) : 0,
    shop: migrateShop(s.shop),
    // v3 → v4：牌多出 enhancement / seal 两个可选字段，旧的普通牌读入后仍是普通牌
    // v4 → v5：商店从一条扁平 offers 拆成 jokers / consumables 两个货架（见 migrateShop）
    deck: migrateCards(s.deck),
    hand: migrateCards(s.hand),
    discardPile: migrateCards(s.discardPile),
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
