import { PACKS, PACKS_PER_SHOP, rollPacks } from './packs';
import { drawConsumables, drawJokers } from './pools';
import { makeRng } from './rng';
import type { ShopState } from './types';

/**
 * 商店是**两个独立池子**（P3 改动，玩家要求）：
 * - 小丑：自己的池，每次固定 3 张。原来小丑与消耗品混在一个池子里，
 *   消耗品一多就把小丑挤掉了。
 * - 消耗品：星球（铭文）+ 符咒合成一个池，每次固定 2 张。原来单店最多 1 张。
 * 两个池各自内部去重，且槽位数可以分别被优惠券加宽。
 *
 * 补充包（2 个）由 rollPacks 抽、优惠券（1 张）由 rollVoucher 抽：
 * 前者要知道底注，后者要知道已买过哪些券，都不属于纯货架逻辑。
 */
export const JOKER_SHELF = 3;
export const CONSUMABLE_SHELF = 2;
export { PACKS_PER_SHOP };
export const REROLL_BASE = 5;
/** 卖出回收比例。改这一行即可调「卖出价是原价的几成」 */
export const SELL_RATE = 0.5;

/** 货架宽度。优惠券会把它加宽，因此必须是可传入的参数而不是常量。 */
export interface ShopShelf {
  jokers: number;
  consumables: number;
}

export const DEFAULT_SHELF: ShopShelf = {
  jokers: JOKER_SHELF,
  consumables: CONSUMABLE_SHELF,
};

/** 卖出价 = 原价 × SELL_RATE，向下取整，最低 $1 */
export function sellValue(cost: number): number {
  if (!Number.isFinite(cost) || cost <= 0) return 1;
  return Math.max(1, Math.floor(cost * SELL_RATE));
}

export function rollShop(
  seed: string,
  nonce: number,
  shelf: ShopShelf = DEFAULT_SHELF,
): ShopState {
  // 两个池用两个子流：加宽小丑货架不会改变消耗品的抽取结果（可预测、好调试）
  const jokerRnd = makeRng(seed, `shop:${nonce}:joker`);
  const consumableRnd = makeRng(seed, `shop:${nonce}:consumable`);

  return {
    jokers: drawJokers(jokerRnd, Math.max(0, shelf.jokers)),
    consumables: drawConsumables(consumableRnd, Math.max(0, shelf.consumables)),
    voucher: null,
    packs: rollPacks(seed, nonce, PACKS_PER_SHOP),
    rerollCost: REROLL_BASE,
    rerolls: 0,
  };
}

/** 供测试与调试：所有能挂出来的包 */
export const ALL_PACK_IDS: string[] = PACKS.map((p) => p.id);
