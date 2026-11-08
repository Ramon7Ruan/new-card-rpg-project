import { CONSUMABLES, type ConsumableDef } from './consumables';
import { JOKERS, type JokerDef } from './jokers';
import type { Rng } from './rng';
import type { ShopOffer } from './types';

/**
 * 抽取原语。单独一个文件是为了打断依赖环：
 * shop（货架）与 packs（补充包）都要抽小丑，但两者互不依赖。
 */

/** 从数组里不重复抽 n 个，保持池内顺序无关 */
export function sample<T>(rnd: Rng, pool: T[], n: number): T[] {
  const rest = pool.slice();
  const out: T[] = [];
  for (let i = 0; i < n && rest.length > 0; i++) {
    const idx = Math.floor(rnd() * rest.length);
    out.push(rest.splice(idx, 1)[0]);
  }
  return out;
}

/** 稀有度权重：普通 70% / 罕见 25% / 稀有 5% */
export function pickByRarity(rnd: Rng, exclude: Set<string>): JokerDef | null {
  const roll = rnd();
  const rarity: JokerDef['rarity'] = roll < 0.7 ? 'common' : roll < 0.95 ? 'uncommon' : 'rare';
  let pool = JOKERS.filter((j) => j.rarity === rarity && !exclude.has(j.id));
  if (pool.length === 0) pool = JOKERS.filter((j) => !exclude.has(j.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(rnd() * pool.length)];
}

export function pickConsumable(rnd: Rng, exclude: Set<string>): ConsumableDef | null {
  const pool = CONSUMABLES.filter((c) => !exclude.has(c.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(rnd() * pool.length)];
}

/** 抽 n 张不重复的小丑。池子抽空就少放，不会重复贴同一张。 */
export function drawJokers(rnd: Rng, count: number): ShopOffer[] {
  const offers: ShopOffer[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const def = pickByRarity(rnd, used);
    if (!def) break;
    used.add(def.id);
    offers.push({ defId: def.id, cost: def.cost, sold: false });
  }
  return offers;
}

/** 抽 n 张不重复的消耗品（星球 + 符咒同池） */
export function drawConsumables(rnd: Rng, count: number): ShopOffer[] {
  const offers: ShopOffer[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const def = pickConsumable(rnd, used);
    if (!def) break;
    used.add(def.id);
    offers.push({ defId: def.id, cost: def.cost, sold: false });
  }
  return offers;
}
