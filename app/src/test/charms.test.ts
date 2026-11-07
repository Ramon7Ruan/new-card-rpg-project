import { describe, expect, it } from 'vitest';
import { card } from '../core/cards';
import { CHARMS } from '../core/charms';
import { getConsumable, MAX_CONSUMABLES } from '../core/consumables';
import { migrateSave } from '../core/persist';
import { createRun, reducer } from '../core/run';
import type { Card, RunState } from '../core/types';

function atTable(cards: Card[], over: Partial<RunState> = {}): RunState {
  return {
    ...createRun('CHARM'),
    phase: 'playing',
    hand: cards,
    deck: [],
    discardPile: [],
    ...over,
  };
}

function withCharm(s: RunState, defId: string): RunState {
  return { ...s, consumables: [{ uid: 'c0', defId }] };
}

/** 用掉槽位里的第一张消耗品，可选带目标 */
function use(s: RunState, targetIds?: string[]): RunState {
  return reducer(s, { type: 'useConsumable', index: 0, targetIds });
}

function ids(s: RunState): string[] {
  return [...s.hand, ...s.deck, ...s.discardPile].map((c) => c.id);
}

function find(s: RunState, id: string): Card | undefined {
  return [...s.hand, ...s.deck, ...s.discardPile].find((c) => c.id === id);
}

describe('P2-4 符咒数据表', () => {
  it('18 张，id 唯一，都能从统一注册表取到', () => {
    expect(CHARMS).toHaveLength(18);
    expect(new Set(CHARMS.map((c) => c.id)).size).toBe(18);
    for (const c of CHARMS) {
      expect(getConsumable(c.id)).toBe(c);
      expect(c.kind).toBe('charm');
      expect(c.cost).toBeGreaterThan(0);
      expect(typeof c.apply).toBe('function');
    }
  });

  it('六种增强各有一张对应的符咒', () => {
    const enh = ['bonus', 'mult', 'glass', 'steel', 'gold', 'wild'];
    for (const e of enh) expect(CHARMS.some((c) => c.id === `charm-${e}`)).toBe(true);
  });

  it('需要目标的都有 needsTarget，经济类不需要目标', () => {
    expect(CHARMS.filter((c) => c.needsTarget === 0).map((c) => c.id).sort()).toEqual([
      'charm-leverage',
      'charm-tithe',
    ]);
    for (const c of CHARMS) expect([0, 1]).toContain(c.needsTarget);
  });
});

describe('P2-4 选目标的使用流程', () => {
  it('数量不对 / id 不存在 / 重复选同一张 → 一律不生效', () => {
    const s = withCharm(atTable([card('s', 14), card('h', 9)]), 'charm-bonus');
    expect(use(s)).toBe(s);
    expect(use(s, [])).toBe(s);
    expect(use(s, ['spade-14', 'heart-9'])).toBe(s);
    expect(use(s, ['no-such-card'])).toBe(s);
    expect(use(s, ['spade-14', 'spade-14'])).toBe(s);
    expect(s.consumables).toHaveLength(1);
  });

  it('正确使用：牌被改造、符咒出槽', () => {
    const s = withCharm(atTable([card('s', 14), card('h', 9)]), 'charm-bonus');
    const after = use(s, ['spade-14']);
    expect(find(after, 'spade-14')?.enhancement).toBe('bonus');
    expect(find(after, 'heart-9')?.enhancement).toBeUndefined();
    expect(after.consumables).toHaveLength(0);
  });

  it('目标可以是牌堆里的牌（商店页手牌为空也能用）', () => {
    const s = withCharm(
      atTable([], { deck: [card('d', 7)], phase: 'shop', shop: { offers: [], rerollCost: 5, rerolls: 0 } }),
      'charm-mult',
    );
    const after = use(s, ['diamond-7']);
    expect(after.deck[0].enhancement).toBe('mult');
  });

  it('盲注选择页不能用符咒（与铭文同一条限制）', () => {
    const s = withCharm(
      { ...createRun('SELECT'), deck: [card('d', 7)], hand: [] },
      'charm-mult',
    );
    expect(s.phase).toBe('blindSelect');
    expect(use(s, ['diamond-7'])).toBe(s);
  });

  it('用符咒不会改牌型等级', () => {
    const s = withCharm(atTable([card('s', 14)]), 'charm-bonus');
    const after = use(s, ['spade-14']);
    expect(after.handLevels).toEqual(s.handLevels);
  });
});

describe('P2-4 单牌改造', () => {
  it('六种增强各写各的字段', () => {
    for (const e of ['bonus', 'mult', 'glass', 'steel', 'gold', 'wild']) {
      const s = withCharm(atTable([card('s', 10)]), `charm-${e}`);
      expect(use(s, ['spade-10']).hand[0].enhancement).toBe(e);
    }
  });

  it('变花色改的是 suit，不改 id（身份稳定）', () => {
    const s = withCharm(atTable([card('s', 10)]), 'charm-heart');
    const after = use(s, ['spade-10']);
    expect(after.hand[0]).toEqual({ id: 'spade-10', suit: 'heart', rank: 10 });
  });

  it('升点：A 回到 2', () => {
    const s = withCharm(atTable([card('s', 14)]), 'charm-rank-up');
    expect(use(s, ['spade-14']).hand[0].rank).toBe(2);
  });

  it('降点：2 回到 A', () => {
    const s = withCharm(atTable([card('s', 2)]), 'charm-rank-down');
    expect(use(s, ['spade-2']).hand[0].rank).toBe(14);
  });

  it('中间的牌正常加减', () => {
    const up = use(withCharm(atTable([card('s', 8)]), 'charm-rank-up'), ['spade-8']);
    const down = use(withCharm(atTable([card('s', 8)]), 'charm-rank-down'), ['spade-8']);
    expect(up.hand[0].rank).toBe(9);
    expect(down.hand[0].rank).toBe(7);
  });

  it('蜡封可以叠在已有增强上（两者互不覆盖）', () => {
    const s = withCharm(atTable([card('s', 10, 'bonus')]), 'charm-seal-red');
    const after = use(s, ['spade-10']);
    expect(after.hand[0].enhancement).toBe('bonus');
    expect(after.hand[0].seal).toBe('red');
  });

  it('改造结果写进存档后仍保留', () => {
    const s = use(withCharm(atTable([card('s', 10)]), 'charm-glass'), ['spade-10']);
    const restored = migrateSave(JSON.parse(JSON.stringify(s))) as RunState;
    expect(restored.hand[0].enhancement).toBe('glass');
  });

  it('改点数后手牌仍按点数排序（2 降成 A，会挪到最后）', () => {
    const s = use(withCharm(atTable([card('s', 2), card('h', 8), card('d', 9)]), 'charm-rank-down'), [
      'spade-2',
    ]);
    expect(s.hand.map((c) => c.id)).toEqual(['heart-8', 'diamond-9', 'spade-2']);
  });
});

describe('P2-4 牌堆操作', () => {
  it('焚毁：手牌、牌堆、弃牌堆里的目标都能删掉', () => {
    const s = withCharm(
      atTable([card('s', 14)], { deck: [card('d', 7)], discardPile: [card('c', 3)] }),
      'charm-destroy',
    );
    const afterHand = use(s, ['spade-14']);
    expect(afterHand.hand).toHaveLength(0);

    const afterDeck = use(s, ['diamond-7']);
    expect(afterDeck.deck).toHaveLength(0);

    const afterDiscard = use(s, ['club-3']);
    expect(afterDiscard.discardPile).toHaveLength(0);
  });

  it('焚毁让牌真的少一张（总数守恒被打破是预期行为）', () => {
    const s = withCharm(atTable([card('s', 14), card('h', 9)]), 'charm-destroy');
    expect(ids(use(s, ['spade-14']))).toHaveLength(1);
  });

  it('复制：新牌进牌堆，连增强一起复制，id 不与原牌重复', () => {
    const s = withCharm(atTable([card('s', 14, 'bonus', 'red')]), 'charm-copy');
    const after = use(s, ['spade-14']);
    expect(after.hand).toHaveLength(1);
    expect(after.deck).toHaveLength(1);
    const copy = after.deck[0];
    expect(copy.id).not.toBe('spade-14');
    expect(copy.enhancement).toBe('bonus');
    expect(copy.seal).toBe('red');
    expect(copy.rank).toBe(14);
  });

  it('连续复制同一张牌，id 也不会撞', () => {
    let s = atTable([card('s', 14)]);
    for (let i = 0; i < 3; i++) {
      s = use(withCharm(s, 'charm-copy'), ['spade-14']);
    }
    const all = ids(s);
    expect(all).toHaveLength(4);
    expect(new Set(all).size).toBe(4);
  });
});

describe('P2-4 经济类', () => {
  it('聚财：+$8，不用选牌', () => {
    const s = withCharm(atTable([], { money: 5 }), 'charm-tithe');
    expect(use(s).money).toBe(13);
  });

  it('杠杆：翻倍，最多 +$20', () => {
    expect(use(withCharm(atTable([], { money: 7 }), 'charm-leverage')).money).toBe(14);
    expect(use(withCharm(atTable([], { money: 50 }), 'charm-leverage')).money).toBe(70);
    expect(use(withCharm(atTable([], { money: 0 }), 'charm-leverage')).money).toBe(0);
  });

  it('经济类给了钱也要出槽', () => {
    const s = withCharm(atTable([], { money: 5 }), 'charm-tithe');
    expect(use(s).consumables).toHaveLength(0);
  });
});

describe('P2-4 与铭文共存', () => {
  it('槽位上限不变：3 张依然买不进', () => {
    const s = atTable([], {
      phase: 'shop',
      money: 99,
      shop: {
        offers: [{ defId: 'charm-bonus', kind: 'consumable', cost: 4, sold: false }],
        rerollCost: 5,
        rerolls: 0,
      },
      consumables: [
        { uid: 'a', defId: 'inscribe-pair' },
        { uid: 'b', defId: 'charm-mult' },
      ],
    });
    expect(s.consumables).toHaveLength(MAX_CONSUMABLES);
    expect(reducer(s, { type: 'buyConsumable', index: 0 })).toBe(s);
  });

  it('铭文仍按牌型升级（符咒没有 target 字段，走的是另一条分支）', () => {
    const s = withCharm(atTable([card('s', 14)]), 'inscribe-flush');
    const after = reducer(s, { type: 'useConsumable', index: 0 });
    expect(after.handLevels.flush).toBe(2);
    expect(after.consumables).toHaveLength(0);
  });
});
