import { CONSUMABLES, type ConsumableDef } from './consumables';
import { JOKERS, type JokerDef } from './jokers';
import { makeRng, type Rng } from './rng';
import type { ShopOffer, ShopState } from './types';

export const SHOP_SLOTS = 2;
export const REROLL_BASE = 5;
/** 每个商品位出现消耗品的概率 */
export const CONSUMABLE_SLOT_CHANCE = 0.3;
/** 单次商店最多 1 个消耗品位：保证任何时候都有小丑可买 */
export const MAX_CONSUMABLE_OFFERS = 1;
/** 卖出回收比例。改这一行即可调「卖出价是原价的几成」 */
export const SELL_RATE = 0.5;

/** 卖出价 = 原价 × SELL_RATE，向下取整，最低 $1 */
export function sellValue(cost: number): number {
  if (!Number.isFinite(cost) || cost <= 0) return 1;
  return Math.max(1, Math.floor(cost * SELL_RATE));
}

/** 稀有度权重：普通 70% / 罕见 25% / 稀有 5% */
function pickByRarity(rnd: Rng, exclude: Set<string>): JokerDef | null {
  const roll = rnd();
  const rarity: JokerDef['rarity'] = roll < 0.7 ? 'common' : roll < 0.95 ? 'uncommon' : 'rare';
  let pool = JOKERS.filter((j) => j.rarity === rarity && !exclude.has(j.id));
  if (pool.length === 0) pool = JOKERS.filter((j) => !exclude.has(j.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(rnd() * pool.length)];
}

function pickConsumable(rnd: Rng, exclude: Set<string>): ConsumableDef | null {
  const pool = CONSUMABLES.filter((c) => !exclude.has(c.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(rnd() * pool.length)];
}

export function rollShop(seed: string, nonce: number): ShopState {
  const rnd = makeRng(seed, `shop:${nonce}`);
  const offers: ShopOffer[] = [];
  const usedJokers = new Set<string>();
  const usedConsumables = new Set<string>();
  let consumablesPlaced = 0;

  for (let i = 0; i < SHOP_SLOTS; i++) {
    const wantsConsumable =
      consumablesPlaced < MAX_CONSUMABLE_OFFERS && rnd() < CONSUMABLE_SLOT_CHANCE;

    if (wantsConsumable) {
      const def = pickConsumable(rnd, usedConsumables);
      if (def) {
        usedConsumables.add(def.id);
        consumablesPlaced += 1;
        offers.push({ defId: def.id, kind: 'consumable', cost: def.cost, sold: false });
        continue;
      }
    }

    const def = pickByRarity(rnd, usedJokers);
    if (!def) break;
    usedJokers.add(def.id);
    offers.push({ defId: def.id, kind: 'joker', cost: def.cost, sold: false });
  }

  return { offers, rerollCost: REROLL_BASE, rerolls: 0 };
}
