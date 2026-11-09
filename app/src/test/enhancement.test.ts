import { describe, expect, it } from 'vitest';
import { card, cardTitle } from '../core/cards';
import { evaluateHand } from '../core/handEval';
import { initialHandLevels } from '../core/hands';
import { migrateSave, sanitizeCard } from '../core/persist';
import { createRun, reducer, SAVE_VERSION } from '../core/run';
import { scoreHand } from '../core/scoring';
import type { Card, JokerInstance, RunState } from '../core/types';

// ── P2-1 卡牌契约升级与迁移 ──────────────────────────────────────

describe('P2-1 Card 契约：牌多出增强 / 蜡封字段', () => {
  const legacy = () => {
    // v3 存档：牌上只有 id / suit / rank
    const raw = JSON.parse(JSON.stringify(createRun('P2LEGACY'))) as Record<string, unknown>;
    raw.version = 3;
    return raw;
  };

  it('版本号是当前 v7', () => {
    // 每次改 RunState 结构都要改这里：数字是给人看的，忘了改说明也忘了迁移
    expect(SAVE_VERSION).toBe(7);
  });

  it('v3 的普通牌读入后仍是普通牌，数量不变', () => {
    const raw = legacy();
    const m = migrateSave(raw) as RunState;
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.deck).toHaveLength(52);
    expect(m.deck.every((c) => c.enhancement === undefined && c.seal === undefined)).toBe(true);
  });

  it('增强 / 蜡封 round-trip 后保留', () => {
    const s: RunState = {
      ...createRun('P2RT'),
      deck: [card('s', 14, 'bonus', 'red'), card('h', 10, 'steel'), card('d', 2)],
      hand: [card('c', 5, 'glass', 'gold')],
      discardPile: [],
    };
    const m = migrateSave(JSON.parse(JSON.stringify(s))) as RunState;
    expect(m.deck[0]).toEqual({ id: 'spade-14', suit: 'spade', rank: 14, enhancement: 'bonus', seal: 'red' });
    expect(m.deck[1].enhancement).toBe('steel');
    expect(m.deck[1].seal).toBeUndefined();
    expect(m.hand[0]).toEqual({ id: 'club-5', suit: 'club', rank: 5, enhancement: 'glass', seal: 'gold' });
  });

  it('未知增强名 / 未知蜡封被剥掉，牌本身保留', () => {
    const c = sanitizeCard({ id: 'x', suit: 'spade', rank: 9, enhancement: 'nope', seal: 'rainbow' });
    expect(c).toEqual({ id: 'x', suit: 'spade', rank: 9 });
  });

  it('结构坏掉的牌整张丢弃，不产生 NaN 卡', () => {
    expect(sanitizeCard(null)).toBeNull();
    expect(sanitizeCard({ id: 'x', suit: 'joker', rank: 3 })).toBeNull();
    expect(sanitizeCard({ id: 'x', suit: 'spade', rank: 99 })).toBeNull();
    expect(sanitizeCard({ id: 'x', suit: 'spade', rank: Number.NaN })).toBeNull();
    expect(sanitizeCard({ suit: 'spade', rank: 3 })).toBeNull();
  });

  it('旧存档里漂着的坏牌不会让整份存档读不出来', () => {
    const raw = legacy();
    (raw.deck as unknown[]).push({ id: 'broken', suit: 'spade' } as never);
    const m = migrateSave(raw) as RunState;
    expect(m.deck).toHaveLength(52);
  });
});

describe('P2-1 card() 构造器与文案', () => {
  it('第四、五个参数写入增强与蜡封', () => {
    expect(card('h', 11, 'mult', 'gold')).toEqual({
      id: 'heart-11',
      suit: 'heart',
      rank: 11,
      enhancement: 'mult',
      seal: 'gold',
    });
  });

  it('不带增强时不写多余字段（存档里不该出现 undefined 键）', () => {
    expect(Object.keys(card('d', 7))).toEqual(['id', 'suit', 'rank']);
  });

  it('悬浮说明包含增强与蜡封的效果', () => {
    const t = cardTitle(card('s', 14, 'glass', 'red'));
    expect(t).toContain('♠A');
    expect(t).toContain('裂隙');
    expect(t).toContain('朱砂');
  });
});

// ── P2-2 增强牌计分 ──────────────────────────────────────────────

const ACES = [card('s', 14), card('h', 14)];

function score(played: Card[], opts: { held?: Card[]; jokers?: JokerInstance[] } = {}) {
  return scoreHand({
    played,
    held: opts.held ?? [],
    jokers: opts.jokers ?? [],
    handLevels: initialHandLevels(),
    money: 10,
    handsLeft: 4,
    discardsUsed: 0,
    ante: 1,
  });
}

describe('P2-2 增强牌的加成通道', () => {
  it('基线：一对 A 仍是 32 × 2 = 64（增强不能动普通牌）', () => {
    const r = score(ACES);
    expect([r.chips, r.mult, r.score]).toEqual([32, 2, 64]);
    expect(r.money).toBe(0);
  });

  it('附加：每张 +30 筹码', () => {
    const r = score([card('s', 14, 'bonus'), card('h', 14, 'bonus')]);
    expect(r.chips).toBe(32 + 60);
    expect(r.mult).toBe(2);
    expect(r.score).toBe(184);
    expect(r.events.filter((e) => e.kind === 'card')).toHaveLength(2);
  });

  it('倍率：+4 倍率落在计分牌上，不碰筹码', () => {
    const r = score([card('s', 14, 'mult'), card('h', 14)]);
    expect(r.chips).toBe(32);
    expect(r.mult).toBe(6);
  });

  it('裂隙：×2 倍率（用满一整手也不会自己碎在计分里）', () => {
    const r = score([card('s', 14, 'glass'), card('h', 14)]);
    expect(r.mult).toBe(4);
    expect(r.score).toBe(128);
  });

  it('铸铁：没打出去的铸铁牌 ×1.5 倍率', () => {
    const r = score(ACES, { held: [card('s', 13, 'steel')] });
    expect(r.chips).toBe(32);
    expect(r.mult).toBe(3);
    expect(r.score).toBe(96);
  });

  it('铸铁打出去了就不生效（这是「留手」效果的边界）', () => {
    const r = score([card('s', 14), card('h', 14)], { held: [card('s', 13)] });
    expect(r.mult).toBe(2);
    expect(r.events.some((e) => e.label.includes('铸铁'))).toBe(false);
  });

  it('两张铸铁留手叠乘（×1.5 ×1.5 = ×2.25）', () => {
    const r = score(ACES, { held: [card('s', 13, 'steel'), card('d', 13, 'steel')] });
    expect(r.mult).toBe(4.5);
    expect(r.score).toBe(Math.round(32 * 4.5));
  });

  it('鎏金在计分时不加筹码也不加倍率，只在回合结束给钱', () => {
    const r = score([card('s', 14, 'gold'), card('h', 14)]);
    expect([r.chips, r.mult, r.money]).toEqual([32, 2, 0]);
  });
});

describe('P2-2 蜡封', () => {
  it('朱砂：这张牌整套结算两次', () => {
    const plain = score([card('s', 14, 'bonus'), card('h', 14)]);
    const red = score([card('s', 14, 'bonus', 'red'), card('h', 14)]);
    // ♠A 的「11 筹码 + 30 附加」被再跑一遍
    expect(plain.chips).toBe(32 + 30);
    expect(red.chips).toBe(32 + 30 + 41);
    expect(red.events.filter((e) => e.kind === 'card')).toHaveLength(3);
    expect(red.events.some((e) => e.label.includes('朱砂'))).toBe(true);
  });

  it('金砂：这张牌每计分一次 +$3；没有蜡封的牌不给钱', () => {
    expect(score([card('s', 14, undefined, 'gold'), card('h', 14)]).money).toBe(3);
    expect(score([card('s', 14), card('h', 14)]).money).toBe(0);
  });

  it('两张金砂各给一次，合计 $6', () => {
    const r = score([card('s', 14, undefined, 'gold'), card('h', 14, undefined, 'gold')]);
    expect(r.money).toBe(6);
  });

  it('金砂不改变分数', () => {
    expect(score([card('s', 14, undefined, 'gold'), card('h', 14)]).score).toBe(64);
  });
});

describe('P2-2 幻形：同花判定', () => {
  it('4 张红心 + 1 张幻形 = 同花', () => {
    const r = score([
      card('h', 2),
      card('h', 3),
      card('h', 4),
      card('h', 6),
      card('s', 13, 'wild'),
    ]);
    expect(r.handType).toBe('flush');
  });

  it('没有幻形时同一手牌不是同花（对照）', () => {
    const cards = [card('h', 2), card('h', 3), card('h', 4), card('h', 6), card('s', 13)];
    expect(evaluateHand(cards).type).not.toBe('flush');
  });

  it('幻形能补成同花顺', () => {
    const r = score([
      card('h', 2),
      card('h', 3),
      card('h', 4),
      card('h', 5),
      card('s', 6, 'wild'),
    ]);
    expect(r.handType).toBe('straightFlush');
  });

  it('5 张全幻形也算同花（没有反例可依）', () => {
    const cards = [
      card('s', 2, 'wild'),
      card('h', 5, 'wild'),
      card('d', 7, 'wild'),
      card('c', 9, 'wild'),
      card('s', 11, 'wild'),
    ];
    expect(evaluateHand(cards).type).toBe('flush');
  });
});

describe('P2-2 结算顺序（硬约定）', () => {
  it('事件顺序：牌型 → 计分牌 → 留手铸铁 → 小丑', () => {
    const r = score([card('s', 14, 'bonus'), card('h', 14)], {
      held: [card('s', 13, 'steel')],
      jokers: [{ uid: 'j0', defId: 'jester' }],
    });
    expect(r.events.map((e) => e.kind)).toEqual(['hand', 'card', 'card', 'card', 'joker']);
    expect(r.events[3].label).toContain('铸铁');
    expect(r.events[4].label).toBe('小丑');
  });

  it('裂隙的 ×2 发生在这个小丑的 ×3 之前（2 ×2 ×3 = 12）', () => {
    const r = score([card('s', 14, 'glass'), card('h', 14)], {
      jokers: [{ uid: 'j0', defId: 'prism' }],
    });
    expect(r.mult).toBe(12);
    expect(r.score).toBe(32 * 12);
  });

  it('每张牌的 chipsDelta / multDelta 与 after 值自洽', () => {
    const r = score([card('s', 14, 'bonus', 'red'), card('h', 14, 'mult')]);
    for (const e of r.events) {
      const idx = r.events.indexOf(e);
      const prev = idx === 0 ? { chipsAfter: 0, multAfter: 0 } : r.events[idx - 1];
      expect(e.chipsAfter).toBe(prev.chipsAfter + e.chipsDelta);
      expect(e.multAfter).toBe(Math.round((prev.multAfter + e.multDelta) * 100) / 100);
    }
  });
});

// ── P2-2 状态机：碎裂、金钱、鎏金结算 ────────────────────────────

function table(cards: Card[], over: Partial<RunState> = {}): RunState {
  return {
    ...createRun('ENHTABLE'),
    phase: 'playing',
    hand: cards,
    deck: [],
    discardPile: [],
    // 牌堆空、手牌上限 0：出牌后不触发补牌与洗回，方便断言弃牌堆
    handSize: 0,
    selected: cards.map((c) => c.id),
    ...over,
  };
}

describe('P2-2 出牌后的状态变化', () => {
  it('裂隙计分后永久碎裂：不进弃牌堆，也不回牌堆', () => {
    const glass = card('s', 14, 'glass');
    const after = reducer(table([glass, card('h', 14)]), { type: 'playHand' });
    expect(after.discardPile.map((c) => c.id)).toEqual(['heart-14']);
    expect(after.hand).toHaveLength(0);
    expect([...after.deck, ...after.hand, ...after.discardPile].some((c) => c.id === glass.id)).toBe(false);
  });

  it('被 Boss 压制的裂隙牌不算分，也就不碎', () => {
    const glass = card('s', 14, 'glass');
    const s = table([glass, card('h', 14)], {
      bossRule: { debuffSuit: 'spade' },
      bossId: 'colorless',
    });
    const after = reducer(s, { type: 'playHand' });
    expect(after.discardPile.some((c) => c.id === glass.id)).toBe(true);
  });

  it('金砂蜡封的 $3 进入资金', () => {
    const s = table([card('s', 14, undefined, 'gold'), card('h', 14)], { money: 10 });
    expect(reducer(s, { type: 'playHand' }).money).toBe(13);
  });

  it('鎏金留手：结算时按留在手里的张数给钱', () => {
    const gold = card('s', 3, 'gold');
    const s: RunState = {
      ...createRun('GOLDOUT'),
      phase: 'cashOut',
      money: 10,
      blindIndex: 0,
      handsLeft: 2,
      hand: [gold, card('h', 4, 'gold'), card('d', 5)],
    };
    // 10 + 盲注奖励(3) + 剩余出牌(2) + 利息(2) + 鎏金 2×3
    const after = reducer(s, { type: 'cashOut' });
    expect(after.money).toBe(10 + 3 + 2 + 2 + 6);
  });
});
