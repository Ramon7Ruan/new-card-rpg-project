import { JOKERS, type JokerDef } from './jokers';
import { makeRng, type Rng } from './rng';
import type { ShopOffer, ShopState } from './types';

export const SHOP_SLOTS = 2;
export const REROLL_BASE = 5;

/** 稀有度权重：普通 70% / 罕见 25% / 稀有 5% */
function pickByRarity(rnd: Rng, exclude: Set<string>): JokerDef | null {
  const roll = rnd();
  const rarity: JokerDef['rarity'] = roll < 0.7 ? 'common' : roll < 0.95 ? 'uncommon' : 'rare';
  let pool = JOKERS.filter((j) => j.rarity === rarity && !exclude.has(j.id));
  if (pool.length === 0) pool = JOKERS.filter((j) => !exclude.has(j.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(rnd() * pool.length)];
}

export function rollShop(seed: string, nonce: number): ShopState {
  const rnd = makeRng(seed, `shop:${nonce}`);
  const offers: ShopOffer[] = [];
  const used = new Set<string>();
  for (let i = 0; i < SHOP_SLOTS; i++) {
    const def = pickByRarity(rnd, used);
    if (!def) break;
    used.add(def.id);
    offers.push({ defId: def.id, cost: def.cost, sold: false });
  }
  return { offers, rerollCost: REROLL_BASE, rerolls: 0 };
}
