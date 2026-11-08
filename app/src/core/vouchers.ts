import { MAX_CONSUMABLES } from './consumables';
import { MAX_JOKERS } from './jokers';
import { CONSUMABLE_SHELF, JOKER_SHELF, REROLL_BASE } from './shop';
import { makeRng } from './rng';
import type { ShopOffer } from './types';

/**
 * 优惠券（P3）：一次购买、永久生效、进存档。
 *
 * 设计约束：**效果必须是纯数据**，不能像塔罗那样带 apply 函数。
 * 原因是它要活在整个 run 里（存档 + 迁移 + 刷新页面），
 * 而「永久增益」最怕的就是某个版本改了函数语义后旧存档数值漂移。
 * 所以效果写成 kind + value，由 voucherEffects() 汇总成一组数值。
 */

export type VoucherEffect =
  /** 小丑槽 +value */
  | { kind: 'jokerSlots'; value: number }
  /** 消耗品槽 +value */
  | { kind: 'consumableSlots'; value: number }
  /** 小丑货架宽 +value */
  | { kind: 'jokerShelf'; value: number }
  /** 消耗品货架宽 +value */
  | { kind: 'consumableShelf'; value: number }
  /** 重摇基础价 −value（不会低于 $1） */
  | { kind: 'rerollDiscount'; value: number }
  /** 利息上限 +value */
  | { kind: 'interestCap'; value: number };

export interface VoucherDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  /** 从第几个底注开始可能出现。1 = 开局就有 */
  minAnte: number;
  effect: VoucherEffect;
}

export const VOUCHERS: VoucherDef[] = [
  {
    id: 'wider-joker',
    name: '加宽货架',
    desc: '商店的小丑货位 +1',
    cost: 8,
    minAnte: 1,
    effect: { kind: 'jokerShelf', value: 1 },
  },
  {
    id: 'wider-consumable',
    name: '加宽货架 II',
    desc: '商店的消耗品货位 +1（星球与符咒）',
    cost: 8,
    minAnte: 1,
    effect: { kind: 'consumableShelf', value: 1 },
  },
  {
    id: 'bigger-joker',
    name: '小丑背包',
    desc: '小丑槽 +1',
    cost: 10,
    minAnte: 1,
    effect: { kind: 'jokerSlots', value: 1 },
  },
  {
    id: 'bigger-consumable',
    name: '消耗品背包',
    desc: '消耗品槽 +1',
    cost: 10,
    minAnte: 2,
    effect: { kind: 'consumableSlots', value: 1 },
  },
  {
    id: 'cheap-reroll',
    name: '常客折扣',
    desc: '重摇基础价 −$1',
    cost: 8,
    minAnte: 2,
    effect: { kind: 'rerollDiscount', value: 1 },
  },
  {
    id: 'deeper-interest',
    name: '高息存款',
    desc: '利息上限 +$1（每 $5 得 $1）',
    cost: 8,
    minAnte: 3,
    effect: { kind: 'interestCap', value: 1 },
  },
];

const BY_ID = new Map(VOUCHERS.map((v) => [v.id, v]));

export function getVoucher(id: string): VoucherDef | undefined {
  return BY_ID.get(id);
}

/** 基础数值。优惠券只在这上面做加/减，所以默认值只有这一处。 */
export const VOUCHER_BASE = {
  jokerSlots: MAX_JOKERS,
  consumableSlots: MAX_CONSUMABLES,
  jokerShelf: JOKER_SHELF,
  consumableShelf: CONSUMABLE_SHELF,
  rerollBase: REROLL_BASE,
  interestCap: 5,
} as const;

export interface VoucherEffects {
  jokerSlots: number;
  consumableSlots: number;
  jokerShelf: number;
  consumableShelf: number;
  rerollBase: number;
  interestCap: number;
}

/**
 * 把持有的券汇总成数值。
 * 未知 id 直接跳过（旧存档删过券也不会崩），同类效果累加。
 */
export function voucherEffects(owned: string[]): VoucherEffects {
  const out: VoucherEffects = { ...VOUCHER_BASE };
  for (const id of owned) {
    const def = getVoucher(id);
    if (!def) continue;
    const { kind, value } = def.effect;
    if (kind === 'jokerSlots') out.jokerSlots += value;
    else if (kind === 'consumableSlots') out.consumableSlots += value;
    else if (kind === 'jokerShelf') out.jokerShelf += value;
    else if (kind === 'consumableShelf') out.consumableShelf += value;
    else if (kind === 'rerollDiscount') out.rerollBase -= value;
    else if (kind === 'interestCap') out.interestCap += value;
  }
  // 折后价不能掉到 0 或负数
  out.rerollBase = Math.max(1, out.rerollBase);
  return out;
}

/** 当前底注下还能买到哪些券（没买过的 + 已解锁的） */
export function availableVouchers(ante: number, owned: string[]): VoucherDef[] {
  const set = new Set(owned);
  return VOUCHERS.filter((v) => v.minAnte <= ante && !set.has(v.id));
}

/**
 * 每次商店只挂 1 张券。池子空了就挂 null，不重复卖已经买过的。
 * 用独立子流，不影响两个货架的抽取结果。
 */
export function rollVoucher(
  seed: string,
  nonce: number,
  ante: number,
  owned: string[],
): ShopOffer | null {
  const pool = availableVouchers(ante, owned);
  if (pool.length === 0) return null;
  const rnd = makeRng(seed, `voucher:${nonce}`);
  const def = pool[Math.floor(rnd() * pool.length)];
  return { defId: def.id, cost: def.cost, sold: false };
}
