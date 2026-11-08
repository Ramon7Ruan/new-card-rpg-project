import { describe, expect, it } from 'vitest';
import { getConsumable } from '../core/consumables';
import { getJoker } from '../core/jokers';
import { PACKS, PACK_CHOICES, PACKS_PER_SHOP, getPack, openPack, rollPacks } from '../core/packs';
import { migrateSave } from '../core/persist';
import { createRun, reducer } from '../core/run';
import { rollShop } from '../core/shop';
import type { PackState, RunState, ShopOffer } from '../core/types';

function shopState(over: Partial<RunState> = {}, packs: ShopOffer[] = []): RunState {
  return {
    ...createRun('PACKTEST'),
    phase: 'shop',
    money: 40,
    shop: { jokers: [], consumables: [], voucher: null, packs, rerollCost: 5, rerolls: 0 },
    ...over,
  };
}

const JOKER_PACK: ShopOffer = { defId: 'pack-joker', cost: 5, sold: false };
const PLANET_PACK: ShopOffer = { defId: 'pack-planet', cost: 3, sold: false };
const CHARM_PACK: ShopOffer = { defId: 'pack-charm', cost: 3, sold: false };
const STANDARD_PACK: ShopOffer = { defId: 'pack-standard', cost: 4, sold: false };

const fiveJokers = ['jester', 'twin', 'prism', 'bronze', 'stone'].map((defId, i) => ({
  uid: `j-${i}`,
  defId,
}));
const twoConsumables = [
  { uid: 'c0', defId: 'inscribe-pair' },
  { uid: 'c1', defId: 'inscribe-flush' },
];

describe('P3-2 包的定义与抽取', () => {
  it('4 类包，id 唯一，价格为正', () => {
    expect(PACKS).toHaveLength(4);
    expect(new Set(PACKS.map((p) => p.id)).size).toBe(4);
    for (const p of PACKS) {
      expect(p.cost).toBeGreaterThan(0);
      expect(p.desc).toContain('选 1 张');
    }
    expect(PACKS.map((p) => p.kind).sort()).toEqual(['charm', 'joker', 'planet', 'standard']);
  });

  it('每次商店挂 2 个不重复的包，价格与定义一致', () => {
    for (let nonce = 0; nonce < 40; nonce++) {
      const packs = rollPacks('PACKS', nonce);
      expect(packs).toHaveLength(PACKS_PER_SHOP);
      expect(new Set(packs.map((p) => p.defId)).size).toBe(PACKS_PER_SHOP);
      for (const o of packs) {
        const def = getPack(o.defId);
        expect(def).toBeTruthy();
        expect(o.cost).toBe(def!.cost);
        expect(o.sold).toBe(false);
      }
    }
  });

  it('商店货架上就带着补充包（rollShop 一起生成）', () => {
    expect(rollShop('SHOPPACK', 1).packs).toHaveLength(PACKS_PER_SHOP);
  });

  it('小丑包：3 张不同的小丑', () => {
    const pack = openPack('POOL', 'k1', getPack('pack-joker')!, 0);
    expect(pack.choices).toHaveLength(PACK_CHOICES);
    const ids = pack.choices.map((c) => (c.kind === 'joker' ? c.defId : ''));
    expect(new Set(ids).size).toBe(PACK_CHOICES);
    for (const id of ids) expect(getJoker(id)).toBeTruthy();
  });

  it('星球包只出星球牌，符咒包只出符咒', () => {
    for (let i = 0; i < 20; i++) {
      const planets = openPack('POOL', `p${i}`, getPack('pack-planet')!, i);
      for (const c of planets.choices) {
        expect(c.kind).toBe('consumable');
        const def = c.kind === 'consumable' ? getConsumable(c.defId) : undefined;
        expect(def?.kind).toBe('planet');
        expect(def?.target).toBeTruthy();
      }

      const charms = openPack('POOL', `c${i}`, getPack('pack-charm')!, i);
      for (const c of charms.choices) {
        expect(c.kind).toBe('consumable');
        const def = c.kind === 'consumable' ? getConsumable(c.defId) : undefined;
        expect(def?.kind).toBe('charm');
      }
    }
  });

  it('同一个包里没有重复条目', () => {
    for (let i = 0; i < 20; i++) {
      for (const id of ['pack-joker', 'pack-planet', 'pack-charm']) {
        const pack = openPack('DEDUPE', `${id}:${i}`, getPack(id)!, i);
        const keys = pack.choices.map((c) => (c.kind === 'card' ? c.card.id : c.defId));
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it('标准包：3 张带增强的牌，花色+点数不重复，id 带 #pack', () => {
    for (let i = 0; i < 20; i++) {
      const pack = openPack('STD', `s${i}`, getPack('pack-standard')!, i);
      expect(pack.choices).toHaveLength(PACK_CHOICES);
      const keys = new Set<string>();
      for (const c of pack.choices) {
        expect(c.kind).toBe('card');
        if (c.kind !== 'card') continue;
        expect(c.card.enhancement).toBeTruthy();
        expect(c.card.id).toContain('#pack');
        keys.add(`${c.card.suit}-${c.card.rank}`);
      }
      expect(keys.size).toBe(PACK_CHOICES);
    }
  });

  it('同一 nonce 开出的内容一致', () => {
    expect(openPack('DET', 'x', getPack('pack-joker')!, 0)).toEqual(
      openPack('DET', 'x', getPack('pack-joker')!, 0),
    );
  });
});

describe('P3-2 买包与开包', () => {
  it('买下：扣钱、货位标记售出、生成候选、序列号 +1', () => {
    const s = shopState({}, [PLANET_PACK]);
    const after = reducer(s, { type: 'buyPack', index: 0 });
    expect(after.money).toBe(37);
    expect(after.shop!.packs[0].sold).toBe(true);
    expect(after.pack).not.toBeNull();
    expect(after.pack!.choices).toHaveLength(PACK_CHOICES);
    expect(after.packSeq).toBe(1);
  });

  it('小丑槽满时买不了小丑包（不静默丢包）', () => {
    const s = shopState({ jokers: fiveJokers }, [JOKER_PACK]);
    expect(reducer(s, { type: 'buyPack', index: 0 })).toBe(s);
  });

  it('消耗品槽满时买不了星球包 / 符咒包', () => {
    const s1 = shopState({ consumables: twoConsumables }, [PLANET_PACK]);
    expect(reducer(s1, { type: 'buyPack', index: 0 })).toBe(s1);
    const s2 = shopState({ consumables: twoConsumables }, [CHARM_PACK]);
    expect(reducer(s2, { type: 'buyPack', index: 0 })).toBe(s2);
  });

  it('标准包不占槽，槽满也能买', () => {
    const s = shopState({ jokers: fiveJokers, consumables: twoConsumables }, [STANDARD_PACK]);
    expect(reducer(s, { type: 'buyPack', index: 0 }).pack).not.toBeNull();
  });

  it('钱不够 / 已售 / 越界 → 无操作', () => {
    const poor = shopState({ money: 1 }, [PLANET_PACK]);
    expect(reducer(poor, { type: 'buyPack', index: 0 })).toBe(poor);

    const sold = shopState({}, [{ ...PLANET_PACK, sold: true }]);
    expect(reducer(sold, { type: 'buyPack', index: 0 })).toBe(sold);

    const oob = shopState({}, [PLANET_PACK]);
    expect(reducer(oob, { type: 'buyPack', index: 3 })).toBe(oob);
  });

  it('选小丑：进槽位，包关闭，只能选一次', () => {
    const s = reducer(shopState({}, [JOKER_PACK]), { type: 'buyPack', index: 0 });
    const first = s.pack!.choices[0];
    const after = reducer(s, { type: 'pickPack', index: 0 });
    expect(after.pack).toBeNull();
    expect(after.jokers).toHaveLength(1);
    if (first.kind === 'joker') expect(after.jokers[0].defId).toBe(first.defId);
    expect(reducer(after, { type: 'pickPack', index: 1 })).toBe(after);
  });

  it('选消耗品：进消耗品槽', () => {
    const s = reducer(shopState({}, [PLANET_PACK]), { type: 'buyPack', index: 0 });
    const after = reducer(s, { type: 'pickPack', index: 0 });
    expect(after.consumables).toHaveLength(1);
    expect(after.pack).toBeNull();
  });

  it('选牌：牌进牌堆，且 id 唯一', () => {
    const s = reducer(shopState({}, [STANDARD_PACK]), { type: 'buyPack', index: 0 });
    const choice = s.pack!.choices[0];
    const deckBefore = s.deck.length;
    const after = reducer(s, { type: 'pickPack', index: 0 });
    expect(after.deck).toHaveLength(deckBefore + 1);
    if (choice.kind === 'card') {
      expect(after.deck.some((c) => c.id === choice.card.id)).toBe(true);
    }
    // 与原牌堆里的牌不撞 id
    const ids = after.deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('跳过：包关闭，牌与钱都不变', () => {
    const s = reducer(shopState({}, [JOKER_PACK]), { type: 'buyPack', index: 0 });
    const after = reducer(s, { type: 'skipPack' });
    expect(after.pack).toBeNull();
    expect(after.jokers).toHaveLength(0);
    expect(after.money).toBe(s.money);
  });

  it('包没处理完时，重摇 / 离开商店 / 买别的东西都不响应', () => {
    const s = reducer(shopState({}, [JOKER_PACK]), { type: 'buyPack', index: 0 });
    expect(reducer(s, { type: 'reroll' })).toBe(s);
    expect(reducer(s, { type: 'leaveShop' })).toBe(s);
    expect(reducer(s, { type: 'buyJoker', index: 0 })).toBe(s);
    expect(reducer(s, { type: 'buyVoucher', index: 0 })).toBe(s);
  });

  it('处理完包之后又能正常离开商店', () => {
    let s = reducer(shopState({}, [JOKER_PACK]), { type: 'buyPack', index: 0 });
    s = reducer(s, { type: 'skipPack' });
    expect(reducer(s, { type: 'leaveShop' }).phase).toBe('blindSelect');
  });
});

describe('P3-2 开包状态的存档', () => {
  const openState = () => reducer(shopState({}, [STANDARD_PACK]), { type: 'buyPack', index: 0 });

  it('刷新页面后包还在（候选是纯数据）', () => {
    const s = openState();
    const restored = migrateSave(JSON.parse(JSON.stringify(s))) as RunState;
    expect(restored.pack).not.toBeNull();
    expect(restored.pack!.choices).toEqual(s.pack!.choices);
    expect(restored.packSeq).toBe(s.packSeq);
  });

  it('候选里的坏条目被丢掉，剩下的仍能选', () => {
    const s = openState();
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    const pack = raw.pack as PackState;
    pack.choices = [
      pack.choices[0],
      { kind: 'joker', defId: 'not-a-joker' },
      { kind: 'card', card: { id: '', suit: 'spade', rank: 99 } },
    ] as PackState['choices'];
    const restored = migrateSave(raw) as RunState;
    expect(restored.pack!.choices).toHaveLength(1);
  });

  it('候选全坏 → 整个包当没开过（不弹空面板）', () => {
    const raw = JSON.parse(JSON.stringify(openState())) as Record<string, unknown>;
    raw.pack = { packId: 'pack-joker', choices: [{ kind: 'joker', defId: 'nope' }] };
    expect(migrateSave(raw)?.pack).toBeNull();
  });

  it('旧存档没有 pack 字段 → null / 0', () => {
    const raw = JSON.parse(JSON.stringify(createRun('NOPACK'))) as Record<string, unknown>;
    delete raw.pack;
    delete raw.packSeq;
    const m = migrateSave(raw);
    expect(m?.pack).toBeNull();
    expect(m?.packSeq).toBe(0);
  });
});
