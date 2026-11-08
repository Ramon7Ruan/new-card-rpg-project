import { describe, expect, it } from 'vitest';
import { rewardFor } from '../core/blinds';
import { migrateSave } from '../core/persist';
import { createRun, reducer, shelfOf } from '../core/run';
import {
  availableVouchers,
  getVoucher,
  rollVoucher,
  VOUCHERS,
  voucherEffects,
  VOUCHER_BASE,
} from '../core/vouchers';
import type { RunState, ShopOffer } from '../core/types';

function shopWith(voucher: ShopOffer | null, over: Partial<RunState> = {}): RunState {
  return {
    ...createRun('VOUCHERTEST'),
    phase: 'shop',
    money: 50,
    shop: {
      jokers: [{ defId: 'jester', cost: 4, sold: false }],
      consumables: [],
      voucher,
      packs: [],
      rerollCost: 5,
      rerolls: 0,
    },
    ...over,
  };
}

describe('P3-1 优惠券：数值汇总', () => {
  it('一张都没买时等于基础值', () => {
    expect(voucherEffects([])).toEqual(VOUCHER_BASE);
    expect(VOUCHER_BASE.jokerSlots).toBe(5);
    expect(VOUCHER_BASE.consumableSlots).toBe(2);
    expect(VOUCHER_BASE.jokerShelf).toBe(3);
    expect(VOUCHER_BASE.consumableShelf).toBe(2);
    expect(VOUCHER_BASE.rerollBase).toBe(5);
    expect(VOUCHER_BASE.interestCap).toBe(5);
  });

  it('每张券只动它自己那一个数', () => {
    const cases: [string, keyof typeof VOUCHER_BASE, number][] = [
      ['wider-joker', 'jokerShelf', 4],
      ['wider-consumable', 'consumableShelf', 3],
      ['bigger-joker', 'jokerSlots', 6],
      ['bigger-consumable', 'consumableSlots', 3],
      ['cheap-reroll', 'rerollBase', 4],
      ['deeper-interest', 'interestCap', 6],
    ];
    for (const [id, field, value] of cases) {
      const fx = voucherEffects([id]);
      expect(fx[field]).toBe(value);
      // 其余字段保持基础值
      for (const key of Object.keys(VOUCHER_BASE) as (keyof typeof VOUCHER_BASE)[]) {
        if (key !== field) expect(fx[key]).toBe(VOUCHER_BASE[key]);
      }
    }
  });

  it('未知 id 被忽略，不会把数值带偏', () => {
    expect(voucherEffects(['not-a-voucher'])).toEqual(VOUCHER_BASE);
  });

  it('重摇价折后为正数，且不会跟着别的券一起变', () => {
    expect(voucherEffects(['cheap-reroll']).rerollBase).toBe(4);
    expect(voucherEffects(['cheap-reroll', 'bigger-joker']).rerollBase).toBe(4);
    expect(voucherEffects([]).rerollBase).toBe(5);
  });
});

describe('P3-1 优惠券：解锁与抽取', () => {
  it('按底注解锁：底注 1 只有 3 张能买', () => {
    expect(availableVouchers(1, []).map((v) => v.id)).toEqual([
      'wider-joker',
      'wider-consumable',
      'bigger-joker',
    ]);
  });

  it('底注越高池子越大', () => {
    expect(availableVouchers(2, [])).toHaveLength(5);
    expect(availableVouchers(3, [])).toHaveLength(VOUCHERS.length);
  });

  it('已经买过的券不再出现在池子里', () => {
    const pool = availableVouchers(3, ['wider-joker', 'cheap-reroll']);
    expect(pool.map((v) => v.id)).not.toContain('wider-joker');
    expect(pool.map((v) => v.id)).not.toContain('cheap-reroll');
    expect(pool).toHaveLength(VOUCHERS.length - 2);
  });

  it('池子空了挂 null，而不是重复卖同一张', () => {
    const all = VOUCHERS.map((v) => v.id);
    expect(rollVoucher('S', 0, 3, all)).toBeNull();
  });

  it('挂出来的券一定是没买过、且已解锁的', () => {
    for (let nonce = 0; nonce < 40; nonce++) {
      const offer = rollVoucher('DET', nonce, 1, ['wider-joker']);
      expect(offer).not.toBeNull();
      const def = getVoucher(offer!.defId);
      expect(def).toBeTruthy();
      expect(def!.minAnte).toBeLessThanOrEqual(1);
      expect(offer!.defId).not.toBe('wider-joker');
      expect(offer!.cost).toBe(def!.cost);
      expect(offer!.sold).toBe(false);
    }
  });

  it('同一 nonce 结果一致', () => {
    expect(rollVoucher('DET2', 3, 3, [])).toEqual(rollVoucher('DET2', 3, 3, []));
  });
});

describe('P3-1 购买优惠券', () => {
  const OFFER: ShopOffer = { defId: 'wider-joker', cost: 8, sold: false };

  it('买下：扣钱、进 vouchers、货位标记售出', () => {
    const s = shopWith(OFFER, { money: 20 });
    const after = reducer(s, { type: 'buyVoucher', index: 0 });
    expect(after.money).toBe(12);
    expect(after.vouchers).toEqual(['wider-joker']);
    expect(after.shop!.voucher!.sold).toBe(true);
  });

  it('买完立刻生效：货架宽度变成 4（下一次商店才看得到）', () => {
    const s = shopWith(OFFER);
    const after = reducer(s, { type: 'buyVoucher', index: 0 });
    expect(shelfOf(after).jokers).toBe(4);
    // 当前这间商店的货架不变——货是进来时就摆好的
    expect(after.shop!.jokers).toHaveLength(1);
  });

  it('钱不够 / 已售出 / 重复购买 / 没有券 都是无操作', () => {
    const poor = shopWith(OFFER, { money: 3 });
    expect(reducer(poor, { type: 'buyVoucher', index: 0 })).toBe(poor);

    const sold = shopWith({ ...OFFER, sold: true });
    expect(reducer(sold, { type: 'buyVoucher', index: 0 })).toBe(sold);

    const none = shopWith(null);
    expect(reducer(none, { type: 'buyVoucher', index: 0 })).toBe(none);

    const bought = shopWith({ ...OFFER, sold: true }, { vouchers: ['wider-joker'] });
    expect(reducer(bought, { type: 'buyVoucher', index: 0 })).toBe(bought);
  });

  it('牌桌上不能买券（只有在商店里才有货位）', () => {
    let s = reducer(createRun('NOSHOP'), { type: 'selectBlind' });
    s = { ...s, money: 99 };
    expect(reducer(s, { type: 'buyVoucher', index: 0 })).toBe(s);
  });
});

describe('P3-1 优惠券对流程的影响', () => {
  it('小丑背包：5 张满了还能再买一张', () => {
    const five = ['jester', 'twin', 'prism', 'bronze', 'stone'].map((defId, i) => ({
      uid: `j-${i}`,
      defId,
    }));
    const offer: ShopOffer = { defId: 'fission', cost: 6, sold: false };
    const base: RunState = {
      ...shopWith(null, { jokers: five, money: 50 }),
      shop: { jokers: [offer], consumables: [], voucher: null, packs: [], rerollCost: 5, rerolls: 0 },
    };
    expect(reducer(base, { type: 'buyJoker', index: 0 })).toBe(base);

    const withVoucher: RunState = { ...base, vouchers: ['bigger-joker'] };
    const bought = reducer(withVoucher, { type: 'buyJoker', index: 0 });
    expect(bought.jokers).toHaveLength(6);
  });

  it('消耗品背包：2 张满了还能再买一张', () => {
    const offer: ShopOffer = { defId: 'inscribe-pair', cost: 3, sold: false };
    const base: RunState = {
      ...shopWith(null, {
        money: 20,
        consumables: [
          { uid: 'c0', defId: 'inscribe-pair' },
          { uid: 'c1', defId: 'inscribe-flush' },
        ],
      }),
      shop: { jokers: [], consumables: [offer], voucher: null, packs: [], rerollCost: 5, rerolls: 0 },
    };
    expect(reducer(base, { type: 'buyConsumable', index: 0 })).toBe(base);

    const withVoucher: RunState = { ...base, vouchers: ['bigger-consumable'] };
    expect(reducer(withVoucher, { type: 'buyConsumable', index: 0 }).consumables).toHaveLength(3);
  });

  it('加宽货架：下一次商店是 4 小丑 + 3 消耗品', () => {
    const s: RunState = {
      ...createRun('WIDEN'),
      phase: 'cashOut',
      blindIndex: 0,
      handsLeft: 1,
      money: 10,
      hand: [],
      vouchers: ['wider-joker', 'wider-consumable'],
    };
    const after = reducer(s, { type: 'cashOut' });
    expect(after.shop!.jokers).toHaveLength(4);
    expect(after.shop!.consumables).toHaveLength(3);
  });

  it('高息存款：利息上限从 $5 提到 $6', () => {
    const base: RunState = {
      ...createRun('INT'),
      phase: 'cashOut',
      blindIndex: 0,
      handsLeft: 0,
      money: 100,
      hand: [],
    };
    // 100 / 5 = 20 利息，基础上限 5
    const plain = reducer(base, { type: 'cashOut' });
    expect(plain.money).toBe(100 + rewardFor(0) + 5);

    const deep = reducer({ ...base, vouchers: ['deeper-interest'] }, { type: 'cashOut' });
    expect(deep.money).toBe(100 + rewardFor(0) + 6);
  });

  it('常客折扣：下次商店的基础重摇价是 $4，且重摇一次变 $5', () => {
    const s: RunState = {
      ...createRun('REROLL'),
      phase: 'cashOut',
      blindIndex: 0,
      handsLeft: 0,
      money: 50,
      hand: [],
      vouchers: ['cheap-reroll'],
    };
    let after = reducer(s, { type: 'cashOut' });
    expect(after.shop!.rerollCost).toBe(4);
    after = reducer(after, { type: 'reroll' });
    expect(after.shop!.rerollCost).toBe(5);
  });

  it('优惠券跨存档保留（含效果）', () => {
    const s = reducer(shopWith({ defId: 'bigger-joker', cost: 10, sold: false }), {
      type: 'buyVoucher',
      index: 0,
    });
    const restored = migrateSave(JSON.parse(JSON.stringify(s))) as RunState;
    expect(restored.vouchers).toEqual(['bigger-joker']);
    expect(voucherEffects(restored.vouchers).jokerSlots).toBe(6);
  });
});

describe('P3-1 优惠券的存档迁移', () => {
  it('旧存档没有 vouchers 字段 → 空数组', () => {
    const raw = JSON.parse(JSON.stringify(createRun('LEGACYV'))) as Record<string, unknown>;
    delete raw.vouchers;
    const m = migrateSave(raw);
    expect(m?.vouchers).toEqual([]);
  });

  it('认不出的券 id 被丢掉、重复的被去重', () => {
    const raw = JSON.parse(JSON.stringify(createRun('LEGACYV2'))) as Record<string, unknown>;
    raw.vouchers = ['bigger-joker', 'gone-voucher', 'bigger-joker'];
    const m = migrateSave(raw);
    expect(m?.vouchers).toEqual(['bigger-joker']);
  });

  it('货位上的券 id 失效时挂 null（不渲染空卡片）', () => {
    const raw = JSON.parse(JSON.stringify(createRun('LEGACYV3'))) as Record<string, unknown>;
    raw.shop = {
      jokers: [],
      consumables: [],
      voucher: { defId: 'gone-voucher', cost: 8, sold: false },
      packs: [],
      rerollCost: 5,
      rerolls: 0,
    };
    const m = migrateSave(raw);
    expect(m?.shop?.voucher).toBeNull();
  });
});
