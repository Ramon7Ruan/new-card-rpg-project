import { describe, expect, it } from 'vitest';
import { getConsumable } from '../core/consumables';
import { getJoker, MAX_JOKERS } from '../core/jokers';
import { createRun, reducer } from '../core/run';
import { sellValue } from '../core/shop';
import type { JokerInstance, RunState, ShopOffer } from '../core/types';

const JOKER_OFFER: ShopOffer = { defId: 'fission', cost: 6, sold: false };
const PLANET_OFFER: ShopOffer = { defId: 'inscribe-pair', cost: 3, sold: false };

/**
 * 商店态构造器。P3 起商店是两个货架，默认只放一张小丑（index 0），
 * 需要消耗品的用例显式传 consumables。
 */
function shopWith(
  over: Partial<RunState> = {},
  shelf: { jokers?: ShopOffer[]; consumables?: ShopOffer[] } = {},
): RunState {
  return {
    ...createRun('SELLTEST'),
    phase: 'shop',
    money: 50,
    shop: {
      jokers: shelf.jokers ?? [JOKER_OFFER],
      consumables: shelf.consumables ?? [],
      voucher: null,
      packs: [],
      rerollCost: 5,
      rerolls: 0,
    },
    ...over,
  };
}

function jokers(...ids: string[]): JokerInstance[] {
  return ids.map((defId, i) => ({ uid: `${defId}-${i}`, defId }));
}

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
    const s = shopWith({ jokers: jokers('jester', 'twin') });
    const after = reducer(s, { type: 'sellJoker', index: 0 });
    expect(after.money).toBe(50 + sellValue(getJoker('jester')!.cost));
    expect(after.jokers.map((j) => j.defId)).toEqual(['twin']);
  });

  it('卖中间一张时其余相对顺序不变', () => {
    const s = shopWith({ jokers: jokers('jester', 'twin', 'prism') });
    const after = reducer(s, { type: 'sellJoker', index: 1 });
    expect(after.jokers.map((j) => j.defId)).toEqual(['jester', 'prism']);
  });

  it('越界索引无操作', () => {
    const s = shopWith({ jokers: jokers('jester') });
    expect(reducer(s, { type: 'sellJoker', index: 3 })).toBe(s);
    expect(reducer(s, { type: 'sellJoker', index: -1 })).toBe(s);
  });
});

describe('S5 卖出消耗品', () => {
  it('商店页卖出铭文：加钱并腾出槽位', () => {
    const s = shopWith(
      { consumables: [{ uid: 'c0', defId: 'inscribe-pair' }] },
      { consumables: [PLANET_OFFER] },
    );
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

    let s = shopWith({ jokers: full, money: 50 });
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
    let s = shopWith({ money: 50 });
    s = reducer(s, { type: 'buyJoker', index: 0 });
    s = reducer(s, { type: 'sellJoker', index: 0 });
    expect(s.money).toBeLessThan(50);
    expect(s.jokers).toHaveLength(0);
  });

  it('两个货架下标互不串用：小丑位只能买小丑，消耗品位只能买消耗品', () => {
    const s = shopWith({}, { jokers: [], consumables: [PLANET_OFFER] });
    // 小丑货架是空的 → 买 0 号无效
    expect(reducer(s, { type: 'buyJoker', index: 0 })).toBe(s);
    // 消耗品只有 0 号，1 号越界
    expect(reducer(s, { type: 'buyConsumable', index: 1 })).toBe(s);
    const ok = reducer(s, { type: 'buyConsumable', index: 0 });
    expect(ok.consumables).toHaveLength(1);
  });

  it('消耗品槽满 2 买不进，卖一张后能买', () => {
    const s = shopWith(
      {
        consumables: [
          { uid: 'c0', defId: 'inscribe-pair' },
          { uid: 'c1', defId: 'inscribe-flush' },
        ],
      },
      { consumables: [PLANET_OFFER] },
    );
    expect(reducer(s, { type: 'buyConsumable', index: 0 })).toBe(s);

    const freed = reducer(s, { type: 'sellConsumable', index: 0 });
    const bought = reducer(freed, { type: 'buyConsumable', index: 0 });
    expect(bought.consumables).toHaveLength(2);
    expect(bought.consumables.map((c) => c.defId)).toContain('inscribe-pair');
  });

  it('买消耗品需要钱够，且同一格不能买两次', () => {
    const poor = shopWith({ money: 2 }, { consumables: [PLANET_OFFER] });
    expect(reducer(poor, { type: 'buyConsumable', index: 0 })).toBe(poor);

    const s = shopWith({ money: 10 }, { consumables: [PLANET_OFFER] });
    const once = reducer(s, { type: 'buyConsumable', index: 0 });
    expect(once.money).toBe(7);
    expect(reducer(once, { type: 'buyConsumable', index: 0 })).toBe(once);
  });
});
