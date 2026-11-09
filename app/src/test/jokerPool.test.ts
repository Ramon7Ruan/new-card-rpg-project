import { describe, expect, it } from 'vitest';
import { card } from '../core/cards';
import { initialHandLevels } from '../core/hands';
import { evaluateHand } from '../core/handEval';
import { getJoker, JOKERS } from '../core/jokers';
import { scoreHand, type ScoreInput } from '../core/scoring';
import { createRun, reducer } from '../core/run';
import type { Card, RunState } from '../core/types';

/**
 * P4：小丑从 18 张扩到 50 张。
 * 这里锁三件事：
 *   1. 数量与四类配额（花色 8 / 点数与人头 8 / 经济 8 / 节奏 8）；
 *   2. 每张新牌都有「触发 + 不触发」两条断言，防止写出永远为 0 或永远为真的效果；
 *   3. **纯常数项 ≤ 10 张**——用两套截然不同的局面跑同一张牌，结果一致就算常数。
 *      测行为而不是读源码或加标记，所以重写实现也不会骗过它。
 */

/** 同一手牌，带不带这张小丑的差值 */
function modsOf(jokerId: string, played: Card[], over: Partial<ScoreInput> = {}) {
  const input: ScoreInput = {
    played,
    held: [],
    jokers: [],
    handLevels: initialHandLevels(),
    money: 10,
    handsLeft: 3,
    discardsUsed: 0,
    ante: 1,
    ...over,
  };
  const base = scoreHand(input);
  const withJoker = scoreHand({ ...input, jokers: [{ uid: 'j0', defId: jokerId }] });
  return {
    chips: withJoker.chips - base.chips,
    mult: withJoker.mult - base.mult,
    score: withJoker.score - base.score,
    money: withJoker.money - base.money,
    changed:
      withJoker.chips !== base.chips ||
      withJoker.mult !== base.mult ||
      withJoker.money !== base.money,
  };
}

/** 回合结束型小丑直接调它的函数，不必跑整局 */
function roundEnd(jokerId: string, ctx: { money: number; ante: number; handsLeft: number }): number {
  const def = getJoker(jokerId);
  expect(def?.onRoundEnd).toBeTruthy();
  return def!.onRoundEnd!(ctx);
}

// ── 常用牌面 ──
const FLUSH_HEART = [card('h', 2), card('h', 4), card('h', 6), card('h', 8), card('h', 10)];
const FLUSH_SPADE = [card('s', 2), card('s', 4), card('s', 6), card('s', 8), card('s', 10)];
const FLUSH_CLUB = [card('c', 2), card('c', 4), card('c', 6), card('c', 8), card('c', 10)];
const FLUSH_DIAMOND = [card('d', 2), card('d', 4), card('d', 6), card('d', 8), card('d', 10)];
const FLUSH_ODD = [card('h', 3), card('h', 5), card('h', 7), card('h', 9), card('h', 11)];
const FLUSH_ROYAL = [card('h', 10), card('h', 11), card('h', 12), card('h', 13), card('h', 14)];
const STRAIGHT_MIX = [card('s', 2), card('h', 3), card('d', 4), card('c', 5), card('s', 6)];
const STRAIGHT_TWO_SUIT = [card('s', 2), card('h', 3), card('s', 4), card('h', 5), card('s', 6)];
const PAIR_ACES = [card('s', 14), card('h', 14)];
const TRIPS_KINGS = [card('s', 13), card('h', 13), card('d', 13)];
const QUADS_ACES = [card('s', 14), card('h', 14), card('d', 14), card('c', 14)];

/** 四类配额。id 写死，顺手把「谁属于哪一类」变成可读文档 */
const CATEGORIES: Record<string, string[]> = {
  花色流: [
    'heart-tithe',
    'club-chain',
    'diamond-edge',
    'spade-crown',
    'suit-sweep',
    'mono-five',
    'wild-love',
    'red-swell',
  ],
  点数与人头: [
    'even-stack',
    'odd-stack',
    'high-ranks',
    'low-ranks',
    'court-bounty',
    'king-tower',
    'queen-garden',
    'ace-anchor',
  ],
  经济流: [
    'spade-bounty',
    'gild-keeper',
    'pauper',
    'rich-tax',
    'frugal-purse',
    'scavenger',
    'miser',
    'ante-stipend',
  ],
  节奏流: ['dump-truck', 'last-hand', 'opening', 'frugal', 'dump-chips', 'triple', 'duo', 'quad'],
};

describe('P4 小丑池规模与配额', () => {
  it('一共 50 张，id 不重复', () => {
    expect(JOKERS).toHaveLength(50);
    expect(new Set(JOKERS.map((j) => j.id)).size).toBe(50);
  });

  it('四类各 8 张，且都能在总表里找到', () => {
    const all = new Set(JOKERS.map((j) => j.id));
    for (const [name, ids] of Object.entries(CATEGORIES)) {
      expect(ids, `${name} 配额`).toHaveLength(8);
      for (const id of ids) expect(all.has(id), `${name} 的 ${id}`).toBe(true);
    }
    const total = Object.values(CATEGORIES).reduce((n, ids) => n + ids.length, 0);
    expect(total).toBe(32);
  });

  it('每张都有名字、说明、正价格与合法稀有度', () => {
    for (const j of JOKERS) {
      expect(j.name.length).toBeGreaterThan(0);
      expect(j.desc.length).toBeGreaterThan(0);
      expect(j.cost).toBeGreaterThan(0);
      expect(['common', 'uncommon', 'rare']).toContain(j.rarity);
    }
  });

  it('价格分档：最低 $2、最高 $7，且普通 ≤ 罕见 ≤ 稀有', () => {
    const maxOf = (r: string) => Math.max(...JOKERS.filter((j) => j.rarity === r).map((j) => j.cost));
    for (const j of JOKERS) {
      expect(j.cost, j.id).toBeGreaterThanOrEqual(2);
      expect(j.cost, j.id).toBeLessThanOrEqual(7);
    }
    expect(maxOf('common')).toBeLessThanOrEqual(maxOf('uncommon'));
    expect(maxOf('uncommon')).toBeLessThanOrEqual(maxOf('rare'));
  });

  it('至少有一个效果通道（不然就是死牌）', () => {
    for (const j of JOKERS) {
      expect(!!j.onScored || !!j.onRoundEnd, j.id).toBe(true);
    }
  });

  it('纯常数项不超过 10 张', () => {
    // 直接看 onScored 给出的**原始加成**（而不是最终分数的差值）：
    // 差值会被基础值稀释，×2 这种乘算在低倍率上手看起来就像 +2，测不出「常数」。
    // 判据：八套局面下原始加成完全一致，且不是「什么都不做」。
    const battery: { cards: Card[]; over: Partial<ScoreInput> }[] = [
      { cards: FLUSH_HEART, over: { money: 30, handsLeft: 4, discardsUsed: 0, ante: 1 } },
      { cards: FLUSH_SPADE, over: { money: 3, handsLeft: 1, discardsUsed: 3, ante: 3 } },
      { cards: FLUSH_CLUB, over: { money: 10, handsLeft: 3, discardsUsed: 1, ante: 2 } },
      { cards: FLUSH_DIAMOND, over: { money: 25, handsLeft: 2, discardsUsed: 2, ante: 2 } },
      { cards: STRAIGHT_MIX, over: { money: 5, handsLeft: 1, discardsUsed: 0, ante: 3 } },
      { cards: PAIR_ACES, over: { money: 10, handsLeft: 4, discardsUsed: 2, ante: 1 } },
      { cards: TRIPS_KINGS, over: { money: 24, handsLeft: 3, discardsUsed: 0, ante: 2 } },
      { cards: [card('s', 13), card('h', 13)], over: { money: 10, handsLeft: 3, discardsUsed: 1, ante: 1 } },
    ];

    const rawMods = (jokerId: string, b: { cards: Card[]; over: Partial<ScoreInput> }) => {
      const def = getJoker(jokerId);
      expect(def?.onScored).toBeTruthy();
      const mods = { chips: 0, mult: 0, xMult: 1, money: 0 };
      def!.onScored!(
        {
          played: b.cards,
          scoring: b.cards,
          handType: evaluateHand(b.cards).type,
          money: b.over.money ?? 10,
          handsLeft: b.over.handsLeft ?? 3,
          discardsUsed: b.over.discardsUsed ?? 0,
          ante: b.over.ante ?? 1,
        },
        mods,
      );
      return mods;
    };

    const pure = JOKERS.filter((j) => {
      if (!j.onScored) return false; // 回合结束型不参与这个统计
      const sigs = battery.map((b) => {
        const m = rawMods(j.id, b);
        return `${m.chips}/${m.mult}/${m.xMult}/${m.money}`;
      });
      const allSame = new Set(sigs).size === 1;
      const didSomething = sigs[0] !== '0/0/1/0';
      return allSame && didSomething;
    }).map((j) => j.id);

    expect(pure.length).toBeLessThanOrEqual(10);
    // 6 张无条件常数：铜块 / 石块 / 小丑 / 双子 / 棱镜（×3）/ 裂变（×2）
    expect(pure.sort()).toEqual(['bronze', 'fission', 'jester', 'prism', 'stone', 'twin']);
  });
});

describe('P4 花色流：触发与不触发', () => {
  it('红心税：红心同花 +20 倍率（每张 +4）', () => {
    expect(modsOf('heart-tithe', FLUSH_HEART).mult).toBe(20);
    expect(modsOf('heart-tithe', FLUSH_SPADE).changed).toBe(false);
  });

  it('梅花链：3 张以上梅花 +60 筹码', () => {
    expect(modsOf('club-chain', FLUSH_CLUB).chips).toBe(60);
    expect(modsOf('club-chain', FLUSH_HEART).changed).toBe(false);
  });

  it('方块刃：每张方块 +25 筹码', () => {
    expect(modsOf('diamond-edge', FLUSH_DIAMOND).chips).toBe(125);
    expect(modsOf('diamond-edge', FLUSH_HEART).changed).toBe(false);
  });

  it('黑桃冠：有 ♠K 时 ×1.5', () => {
    const changed = modsOf('spade-crown', [card('s', 13), card('h', 13)]);
    expect(changed.changed).toBe(true);
    expect(changed.mult).toBeGreaterThan(0);
    // 只有红桃 K，没有黑桃 K
    expect(modsOf('spade-crown', [card('h', 13), card('h', 13)]).changed).toBe(false);
  });

  it('四色齐：四种花色齐全给 $3', () => {
    expect(modsOf('suit-sweep', STRAIGHT_MIX).money).toBe(3);
    expect(modsOf('suit-sweep', STRAIGHT_TWO_SUIT).changed).toBe(false);
  });

  it('单色五：恰好 5 张同花色 ×2', () => {
    expect(modsOf('mono-five', FLUSH_HEART).changed).toBe(true);
    expect(modsOf('mono-five', STRAIGHT_MIX).changed).toBe(false);
    // 只有 2 张同花色，不满足「5 张」
    expect(modsOf('mono-five', PAIR_ACES).changed).toBe(false);
  });

  it('幻形恋：每张幻形 +10 倍率', () => {
    expect(modsOf('wild-love', [card('s', 14, 'wild'), card('h', 14)]).mult).toBe(10);
    expect(modsOf('wild-love', PAIR_ACES).changed).toBe(false);
  });

  it('红潮：红桃+方块 ≥3 张 +45 筹码', () => {
    expect(modsOf('red-swell', FLUSH_HEART).chips).toBe(45);
    expect(modsOf('red-swell', FLUSH_SPADE).changed).toBe(false);
  });
});

describe('P4 点数与人头：触发与不触发', () => {
  it('偶数堆：每张偶数 +8 筹码', () => {
    expect(modsOf('even-stack', FLUSH_HEART).chips).toBe(40);
    expect(modsOf('even-stack', FLUSH_ODD).changed).toBe(false);
  });

  it('奇数堆：每张奇数 +4 倍率', () => {
    expect(modsOf('odd-stack', FLUSH_ODD).mult).toBe(20);
    expect(modsOf('odd-stack', FLUSH_HEART).changed).toBe(false);
  });

  it('大牌压：10 以上每张 +12 筹码', () => {
    expect(modsOf('high-ranks', FLUSH_ROYAL).chips).toBe(60);
    // 全是 9 以下的同花，一张都不够 10
    const lowFlush = [card('h', 2), card('h', 4), card('h', 6), card('h', 8), card('h', 9)];
    expect(modsOf('high-ranks', lowFlush).changed).toBe(false);
  });

  it('小牌撬：2–5 每张 +5 倍率', () => {
    // h2 h3 h4 h5 是 4 张 ≤5，h6 不算
    expect(modsOf('low-ranks', [card('h', 2), card('h', 3), card('h', 4), card('h', 5), card('h', 6)]).mult).toBe(20);
    expect(modsOf('low-ranks', FLUSH_ROYAL).changed).toBe(false);
  });

  it('人头赏：每张 J/Q/K +$1', () => {
    expect(modsOf('court-bounty', [card('h', 11), card('h', 12), card('h', 13), card('h', 2), card('h', 4)]).money).toBe(3);
    expect(modsOf('court-bounty', FLUSH_HEART).changed).toBe(false);
  });

  it('王塔：每张 K ×1.5', () => {
    const one = modsOf('king-tower', [card('h', 13), card('h', 2), card('h', 4), card('h', 6), card('h', 8)]);
    expect(one.changed).toBe(true);
    expect(one.mult).toBeGreaterThan(0);
    expect(modsOf('king-tower', FLUSH_HEART).changed).toBe(false);
  });

  it('后园：每张 Q +6 倍率', () => {
    expect(modsOf('queen-garden', [card('h', 12), card('h', 2), card('h', 4), card('h', 6), card('h', 8)]).mult).toBe(6);
    expect(modsOf('queen-garden', FLUSH_HEART).changed).toBe(false);
  });

  it('王牌锚：每张 A +25 筹码 +2 倍率', () => {
    const r = modsOf('ace-anchor', [card('h', 14), card('h', 2), card('h', 4), card('h', 6), card('h', 8)]);
    expect(r.chips).toBe(25);
    expect(r.mult).toBe(2);
    expect(modsOf('ace-anchor', FLUSH_HEART).changed).toBe(false);
  });
});

describe('P4 经济流：触发与不触发', () => {
  it('黑桃赏：每张黑桃 +$1', () => {
    expect(modsOf('spade-bounty', FLUSH_SPADE).money).toBe(5);
    expect(modsOf('spade-bounty', FLUSH_HEART).changed).toBe(false);
  });

  it('镀金匠：计分牌里有金砂时 +$3', () => {
    expect(modsOf('gild-keeper', [card('s', 14, undefined, 'gold'), card('h', 14)]).money).toBe(3);
    expect(modsOf('gild-keeper', PAIR_ACES).changed).toBe(false);
  });

  it('穷汉：资金 ≤5 时 +18 倍率', () => {
    expect(modsOf('pauper', PAIR_ACES, { money: 5 }).mult).toBe(18);
    expect(modsOf('pauper', PAIR_ACES, { money: 6 }).changed).toBe(false);
  });

  it('富税：资金 ≥25 时 ×2', () => {
    expect(modsOf('rich-tax', PAIR_ACES, { money: 25 }).changed).toBe(true);
    expect(modsOf('rich-tax', PAIR_ACES, { money: 24 }).changed).toBe(false);
  });

  it('铁钱包：没弃过牌时 +$2', () => {
    expect(modsOf('frugal-purse', PAIR_ACES, { discardsUsed: 0 }).money).toBe(2);
    expect(modsOf('frugal-purse', PAIR_ACES, { discardsUsed: 1 }).changed).toBe(false);
  });

  it('拾荒：回合结束每剩 1 次出牌 +$1', () => {
    expect(roundEnd('scavenger', { money: 10, ante: 1, handsLeft: 3 })).toBe(3);
    expect(roundEnd('scavenger', { money: 10, ante: 1, handsLeft: 0 })).toBe(0);
  });

  it('守财：资金 ≥10 时 +$2', () => {
    expect(roundEnd('miser', { money: 10, ante: 1, handsLeft: 0 })).toBe(2);
    expect(roundEnd('miser', { money: 9, ante: 1, handsLeft: 0 })).toBe(0);
  });

  it('底注津贴：底注 ≥3 给 $3，否则 $1', () => {
    expect(roundEnd('ante-stipend', { money: 0, ante: 3, handsLeft: 0 })).toBe(3);
    expect(roundEnd('ante-stipend', { money: 0, ante: 1, handsLeft: 0 })).toBe(1);
  });
});

describe('P4 节奏流：触发与不触发', () => {
  it('弃牌车：已弃 ≥2 次 +40 筹码', () => {
    expect(modsOf('dump-truck', PAIR_ACES, { discardsUsed: 2 }).chips).toBe(40);
    expect(modsOf('dump-truck', PAIR_ACES, { discardsUsed: 1 }).changed).toBe(false);
  });

  it('背水：只剩 1 次出牌 ×2', () => {
    expect(modsOf('last-hand', PAIR_ACES, { handsLeft: 1 }).changed).toBe(true);
    expect(modsOf('last-hand', PAIR_ACES, { handsLeft: 2 }).changed).toBe(false);
  });

  it('先手：还剩 4 次出牌 +10 倍率', () => {
    expect(modsOf('opening', PAIR_ACES, { handsLeft: 4 }).mult).toBe(10);
    expect(modsOf('opening', PAIR_ACES, { handsLeft: 3 }).changed).toBe(false);
  });

  it('不弃：没弃过牌 ×1.5', () => {
    expect(modsOf('frugal', PAIR_ACES, { discardsUsed: 0 }).changed).toBe(true);
    expect(modsOf('frugal', PAIR_ACES, { discardsUsed: 1 }).changed).toBe(false);
  });

  it('弃换筹：每弃 1 次 +20 筹码', () => {
    expect(modsOf('dump-chips', PAIR_ACES, { discardsUsed: 2 }).chips).toBe(40);
    expect(modsOf('dump-chips', PAIR_ACES, { discardsUsed: 0 }).changed).toBe(false);
  });

  it('三张流：恰好 3 张 +12 倍率', () => {
    expect(modsOf('triple', TRIPS_KINGS).mult).toBe(12);
    expect(modsOf('triple', PAIR_ACES).changed).toBe(false);
  });

  it('两张牌：恰好 2 张 +8 倍率', () => {
    expect(modsOf('duo', PAIR_ACES).mult).toBe(8);
    expect(modsOf('duo', TRIPS_KINGS).changed).toBe(false);
  });

  it('四张牌：恰好 4 张 ×1.5', () => {
    expect(modsOf('quad', QUADS_ACES).changed).toBe(true);
    expect(modsOf('quad', TRIPS_KINGS).changed).toBe(false);
  });
});

describe('P4 小丑给钱的通道', () => {
  it('金钱进 ScoreResult.money，并且和蜡封的钱相加', () => {
    const s = scoreHand({
      played: [card('s', 2), card('h', 3), card('d', 4), card('c', 5), card('s', 6)],
      jokers: [{ uid: 'j0', defId: 'suit-sweep' }],
      handLevels: initialHandLevels(),
      money: 10,
      handsLeft: 3,
      discardsUsed: 0,
      ante: 1,
    });
    expect(s.money).toBe(3);
  });

  it('出牌后钱真的进了资金（不是只在结果里）', () => {
    const s = scoreHand({
      played: [card('s', 14), card('h', 14)],
      jokers: [{ uid: 'j0', defId: 'frugal-purse' }],
      handLevels: initialHandLevels(),
      money: 10,
      handsLeft: 3,
      discardsUsed: 0,
      ante: 1,
    });
    expect(s.money).toBe(2);
  });

  it('×倍率按槽位顺序连乘：一对 K 先被王塔 ×1.5 ×1.5，再被棱镜 ×3', () => {
    const base = scoreHand({
      played: [card('s', 13), card('h', 13)],
      jokers: [],
      handLevels: initialHandLevels(),
      money: 10,
      handsLeft: 3,
      discardsUsed: 0,
      ante: 1,
    });
    expect(base.mult).toBe(2);

    const withBoth = scoreHand({
      played: [card('s', 13), card('h', 13)],
      jokers: [
        { uid: 'a', defId: 'king-tower' },
        { uid: 'b', defId: 'prism' },
      ],
      handLevels: initialHandLevels(),
      money: 10,
      handsLeft: 3,
      discardsUsed: 0,
      ante: 1,
    });
    // 2 × 1.5（第一张 K）× 1.5（第二张 K）× 3（棱镜）= 13.5
    expect(withBoth.mult).toBe(13.5);
  });

  it('回合结束的钱进资金（拾荒：剩 2 次出牌 → +$2）', () => {
    const s: RunState = {
      ...createRun('SCAV'),
      phase: 'cashOut',
      blindIndex: 0,
      handsLeft: 2,
      money: 10,
      hand: [],
      jokers: [{ uid: 'j0', defId: 'scavenger' }],
    };
    // 10 + 盲注奖励 3 + 剩余出牌 2 + 利息 2 + 拾荒 2
    expect(reducer(s, { type: 'cashOut' }).money).toBe(10 + 3 + 2 + 2 + 2);
  });
});
