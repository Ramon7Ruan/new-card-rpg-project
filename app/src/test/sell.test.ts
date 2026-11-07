import { describe, expect, it } from 'vitest';
import { getConsumable } from '../core/consumables';
import { getJoker, MAX_JOKERS } from '../core/jokers';
import { createRun, reducer } from '../core/run';
import { CONSUMABLE_SLOT_CHANCE, MAX_CONSUMABLE_OFFERS, rollShop, sellValue, SHOP_SLOTS } from '../core/shop';
import type { JokerInstance, RunState, ShopOffer } from '../core/types';

function shopWith(offers: ShopOffer[], over: Partial<RunState> = {}): RunState {
  return {
    ...createRun('SELLTEST'),
    phase: 'shop',
    money: 50,
    shop: { offers, rerollCost: 5, rerolls: 0 },
    ...over,
  };
}

function jokers(...ids: string[]): JokerInstance[] {
  return ids.map((defId, i) => ({ uid: `${defId}-${i}`, defId }));
}

const JOKER_OFFER: ShopOffer = { defId: 'fission', kind: 'joker', cost: 6, sold: false };
const PLANET_OFFER: ShopOffer = { defId: 'inscribe-pair', kind: 'consumable', cost: 3, sold: false };

describe('S5 卖出价', () => {
  it('原价一半，向下取整', () => {
    expect(sellValue(2)).toBe(1);
    expect(sellValue(3)).toBe(1);
    expect(sellValue(4)).toBe(2);
    expect(sellValue(5)).toBe(2);
    expect(sellValue(6)).toBe(3);
    expect(sellValue(7)).toBe(3);
    expect(sellValue(8)).toBe(4);
  });

  it('最低 $1，异常输入不产生 NaN / 负数', () => {
    expect(sellValue(0)).toBe(1);
    expect(sellValue(-5)).toBe(1);
    expect(sellValue(Number.NaN)).toBe(1);
  });
});

describe('S5 卖出小丑', () => {
  it('只能在商店页卖：牌桌上无效', () => {
    let s = reducer(createRun('S'), { type: 'selectBlind' });
    s = { ...s, jokers: jokers('jester') };
    const after = reducer(s, { type: 'sellJoker', index: 0 });
    expect(after).toBe(s);
  });

  it('商店页卖出：加钱、移除、其余不动', () => {
    const s = shopWith([JOKER_OFFER], { jokers: jokers('jester', 'twin') });
    const after = reducer(s, { type: 'sellJoker', index: 0 });
    expect(after.money).toBe(50 + sellValue(getJoker('jester')!.cost));
    expect(after.jokers.map((j) => j.defId)).toEqual(['twin']);
  });

  it('卖中间一张时其余相对顺序不变', () => {
    const s = shopWith([JOKER_OFFER], { jokers: jokers('jester', 'twin', 'prism') });
    const after = reducer(s, { type: 'sellJoker', index: 1 });
    expect(after.jokers.map((j) => j.defId)).toEqual(['jester', 'prism']);
  });

  it('越界索引无操作', () => {
    const s = shopWith([JOKER_OFFER], { jokers: jokers('jester') });
    expect(reducer(s, { type: 'sellJoker', index: 3 })).toBe(s);
    expect(reducer(s, { type: 'sellJoker', index: -1 })).toBe(s);
  });
});

describe('S5 卖出消耗品', () => {
  it('商店页卖出铭文：加钱并腾出槽位', () => {
    const s = shopWith([PLANET_OFFER], {
      consumables: [{ uid: 'c0', defId: 'inscribe-pair' }],
    });
    const after = reducer(s, { type: 'sellConsumable', index: 0 });
    expect(after.money).toBe(50 + sellValue(getConsumable('inscribe-pair')!.cost));
    expect(after.consumables).toHaveLength(0);
  });

  it('牌桌上不能卖消耗品', () => {
    let s = reducer(createRun('S2'), { type: 'selectBlind' });
    s = { ...s, consumables: [{ uid: 'c0', defId: 'inscribe-pair' }] };
    expect(reducer(s, { type: 'sellConsumable', index: 0 })).toBe(s);
  });
});

describe('S5 买入的槽位与类型约束', () => {
  it('小丑槽满买不进 → 卖一张 → 能买进（这就是做卖出的原因）', () => {
    const full = jokers('jester', 'twin', 'prism', 'bronze', 'stone');
    expect(full).toHaveLength(MAX_JOKERS);

    let s = shopWith([JOKER_OFFER], { jokers: full, money: 50 });
    const blocked = reducer(s, { type: 'buyJoker', index: 0 });
    expect(blocked).toBe(s);

    s = reducer(s, { type: 'sellJoker', index: 0 });
    const bought = reducer(s, { type: 'buyJoker', index: 0 });
    expect(bought.jokers).toHaveLength(MAX_JOKERS);
    expect(bought.jokers.some((j) => j.defId === 'fission')).toBe(true);
    // $50 + 卖价(jester) − 买价(fission)
    expect(bought.money).toBe(50 + sellValue(2) - 6);
  });

  it('买进再卖出一定是净亏（防止无限试错）', () => {
    let s = shopWith([JOKER_OFFER], { money: 50 });
    s = reducer(s, { type: 'buyJoker', index: 0 });
    s = reducer(s, { type: 'sellJoker', index: 0 });
    expect(s.money).toBeLessThan(50);
    expect(s.jokers).toHaveLength(0);
  });

  it('buyJoker 不接受消耗品位，buyConsumable 不接受小丑位', () => {
    const s = shopWith([PLANET_OFFER, JOKER_OFFER], { jokers: [] });
    expect(reducer(s, { type: 'buyJoker', index: 0 })).toBe(s);
    expect(reducer(s, { type: 'buyConsumable', index: 1 })).toBe(s);
  });

  it('消耗品槽满 2 买不进，卖一张后能买', () => {
    const s = shopWith([PLANET_OFFER], {
      consumables: [
        { uid: 'c0', defId: 'inscribe-pair' },
        { uid: 'c1', defId: 'inscribe-flush' },
      ],
    });
    expect(reducer(s, { type: 'buyConsumable', index: 0 })).toBe(s);

    const freed = reducer(s, { type: 'sellConsumable', index: 0 });
    const bought = reducer(freed, { type: 'buyConsumable', index: 0 });
    expect(bought.consumables).toHaveLength(2);
    expect(bought.consumables.map((c) => c.defId)).toContain('inscribe-pair');
  });

  it('买消耗品需要钱够，且同一格不能买两次', () => {
    const poor = shopWith([PLANET_OFFER], { money: 2 });
    expect(reducer(poor, { type: 'buyConsumable', index: 0 })).toBe(poor);

    const s = shopWith([PLANET_OFFER], { money: 10 });
    const once = reducer(s, { type: 'buyConsumable', index: 0 });
    expect(once.money).toBe(7);
    expect(reducer(once, { type: 'buyConsumable', index: 0 })).toBe(once);
  });
});

describe('S5 商店货架', () => {
  it('每个商品都带合法 kind，且 defId 不重复', () => {
    for (let nonce = 0; nonce < 40; nonce++) {
      const shop = rollShop('SHELF', nonce);
      expect(shop.offers).toHaveLength(SHOP_SLOTS);
      for (const o of shop.offers) {
        expect(['joker', 'consumable']).toContain(o.kind);
        expect(o.cost).toBeGreaterThan(0);
      }
      expect(new Set(shop.offers.map((o) => o.defId)).size).toBe(shop.offers.length);
    }
  });

  it('单次商店最多 1 个消耗品位（保证总有可买的小丑）', () => {
    let consumableSeen = 0;
    for (let nonce = 0; nonce < 200; nonce++) {
      const shop = rollShop('CHANCE', nonce);
      const count = shop.offers.filter((o) => o.kind === 'consumable').length;
      expect(count).toBeLessThanOrEqual(MAX_CONSUMABLE_OFFERS);
      expect(shop.offers.length - count).toBeGreaterThanOrEqual(1);
      consumableSeen += count;
    }
    // 200 次里应当出现相当数量的消耗品位（30% 概率，2 位）
    expect(consumableSeen).toBeGreaterThan(40);
    expect(consumableSeen).toBeLessThan(200 * 2 * (CONSUMABLE_SLOT_CHANCE + 0.15));
  });

  it('同一 nonce 结果完全一致，不同 nonce 会变', () => {
    expect(rollShop('DET', 7)).toEqual(rollShop('DET', 7));
    const a = JSON.stringify(rollShop('DET', 1).offers);
    const b = JSON.stringify(rollShop('DET', 2).offers);
    const c = JSON.stringify(rollShop('DET', 3).offers);
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });
});
