import { describe, expect, it } from 'vitest';
import { BOSSES, describeBlindRule, getBoss, rollBoss } from '../core/blinds';
import { card, SUITS } from '../core/cards';
import { initialHandLevels } from '../core/hands';
import { migrateSave } from '../core/persist';
import { createRun, reducer, SAVE_VERSION } from '../core/run';
import { scoreHand } from '../core/scoring';
import type { BlindRule, RunState } from '../core/types';

/** 直接进入指定 Boss 的牌桌（bossId 只供测试显式指定） */
function enterBoss(seed: string, bossId: string, ante = 1): RunState {
  let s = createRun(seed);
  s = { ...s, ante, blindIndex: 2 };
  return reducer(s, { type: 'selectBlind', bossId });
}

function countCards(s: RunState): number {
  return s.deck.length + s.hand.length + s.discardPile.length;
}

const BASE = {
  jokers: [],
  handLevels: initialHandLevels(),
  money: 0,
  handsLeft: 4,
  discardsUsed: 0,
  ante: 1,
};

const RULE_KEYS = new Set<keyof BlindRule>([
  'targetMultiplier',
  'forbidDiscards',
  'handSizeDelta',
  'requirePlayedCards',
  'debuffSuit',
  'debuffFace',
]);

describe('S1 Boss 数据表', () => {
  it('恰好 6 个 Boss，id 与名字都不重复', () => {
    expect(BOSSES).toHaveLength(6);
    expect(new Set(BOSSES.map((b) => b.id)).size).toBe(6);
    expect(new Set(BOSSES.map((b) => b.name)).size).toBe(6);
  });

  it('规则只用已知字段，且都是纯数据', () => {
    for (const boss of BOSSES) {
      for (const key of Object.keys(boss.rule)) {
        expect(RULE_KEYS.has(key as keyof BlindRule)).toBe(true);
      }
      // 含函数的对象无法 JSON 序列化，等同进不了存档
      expect(() => JSON.stringify(boss.rule)).not.toThrow();
      expect(JSON.parse(JSON.stringify(boss.rule))).toEqual(boss.rule);
    }
  });

  it('每个 Boss 至少有一条可读的效果文案', () => {
    for (const boss of BOSSES) {
      const resolved = boss.randomSuit
        ? { ...boss.rule, debuffSuit: 'heart' as const }
        : boss.rule;
      expect(describeBlindRule(resolved).length).toBeGreaterThan(0);
    }
  });

  it('getBoss 按 id 取回，未知 id 返回 undefined', () => {
    expect(getBoss('rampart')?.name).toBe('铁壁');
    expect(getBoss('nope')).toBeUndefined();
    expect(getBoss(null)).toBeUndefined();
  });
});

describe('S1 rollBoss 确定性', () => {
  it('同 seed 同底注 → 同一个 Boss 与同一套规则', () => {
    for (const seed of ['A', 'B', 'C', 'XYZ123']) {
      for (const ante of [1, 2]) {
        const a = rollBoss(seed, ante);
        const b = rollBoss(seed, ante);
        expect(a.boss.id).toBe(b.boss.id);
        expect(a.rule).toEqual(b.rule);
      }
    }
  });

  it('不同 seed 能抽到不止一个 Boss', () => {
    const ids = new Set(
      Array.from({ length: 30 }, (_, i) => rollBoss(`SEED${i}`, 1).boss.id),
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  it('失色一定解析出一种合法花色，其他 Boss 不带花色', () => {
    let checked = 0;
    for (let i = 0; i < 200 && checked < 20; i++) {
      const { boss, rule } = rollBoss(`FADE${i}`, 1);
      if (boss.id !== 'fade') {
        expect(rule.debuffSuit).toBeUndefined();
        continue;
      }
      checked += 1;
      expect(SUITS).toContain(rule.debuffSuit);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('S2 规则在进入盲注时生效', () => {
  it('铁壁：目标 = 基础目标 ×1.5（两个底注都成立）', () => {
    expect(enterBoss('A', 'rampart', 1).target).toBe(900);
    expect(enterBoss('A', 'rampart', 2).target).toBe(2400);
  });

  it('干涸：弃牌次数为 0，弃牌动作无效', () => {
    let s = enterBoss('B', 'drought');
    expect(s.discardsLeft).toBe(0);

    s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
    const after = reducer(s, { type: 'discard' });
    expect(after).toBe(s);
    expect(after.discardsLeft).toBe(0);
    expect(after.hand).toHaveLength(8);
  });

  it('束带：手牌上限降为 7，发牌与牌堆总数正确', () => {
    const s = enterBoss('C', 'girdle');
    expect(s.handSize).toBe(7);
    expect(s.hand).toHaveLength(7);
    expect(countCards(s)).toBe(52);
  });

  it('铁律：出牌次数与弃牌次数不变，只加了出牌张数要求', () => {
    const s = enterBoss('D', 'decree');
    expect(s.handsLeft).toBe(4);
    expect(s.discardsLeft).toBe(3);
    expect(s.bossRule?.requirePlayedCards).toBe(5);
  });

  it('失色：解出一种花色写进规则', () => {
    const s = enterBoss('E', 'fade');
    expect(SUITS).toContain(s.bossRule?.debuffSuit);
  });

  it('无名：规则标记人头牌不计分', () => {
    const s = enterBoss('F', 'nameless');
    expect(s.bossRule?.debuffFace).toBe(true);
  });

  it('非 Boss 盲注不带任何规则', () => {
    const s = reducer(createRun('G'), { type: 'selectBlind' });
    expect(s.bossId).toBeNull();
    expect(s.bossRule).toBeNull();
    expect(s.handSize).toBe(8);
    expect(s.hand).toHaveLength(8);
  });

  it('未知 bossId 回退到 seed 抽到的 Boss，不会让状态崩掉', () => {
    const s = enterBoss('H', 'not-a-boss');
    expect(s.bossId).toBe(rollBoss('H', 1).boss.id);
    expect(s.bossRule).toEqual(rollBoss('H', 1).rule);
  });

  it('打完 Boss 进商店再离开，规则与手牌上限被清空', () => {
    let s = enterBoss('I', 'girdle');
    s = { ...s, target: 1 };
    s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
    s = reducer(s, { type: 'playHand' });
    expect(s.phase).toBe('cashOut');
    s = reducer(s, { type: 'cashOut' });
    expect(s.phase).toBe('shop');
    s = reducer(s, { type: 'leaveShop' });
    expect(s.phase).toBe('blindSelect');
    expect(s.bossId).toBeNull();
    expect(s.bossRule).toBeNull();
    expect(s.handSize).toBe(8);
  });
});

describe('S3 被压制的牌不计分，但仍参与牌型识别', () => {
  const hearts = [
    card('h', 2),
    card('h', 5),
    card('h', 8),
    card('h', 11),
    card('h', 13),
  ];

  it('失色：整副红桃同花 → 牌型仍是同花，但只有基础筹码', () => {
    const normal = scoreHand({ ...BASE, played: hearts });
    const faded = scoreHand({ ...BASE, played: hearts, rule: { debuffSuit: 'heart' } });

    expect(normal.handType).toBe('flush');
    expect(faded.handType).toBe('flush');
    expect(faded.chips).toBe(35); // 同花基础值，5 张牌一分没加
    expect(faded.debuffedCardIds).toHaveLength(5);
    expect(faded.scoringCardIds).toHaveLength(0);
    expect(faded.score).toBeLessThan(normal.score);
  });

  it('失色只影响被点名的花色', () => {
    const withSpade = scoreHand({ ...BASE, played: hearts, rule: { debuffSuit: 'spade' } });
    const normal = scoreHand({ ...BASE, played: hearts });
    expect(withSpade.score).toBe(normal.score);
    expect(withSpade.debuffedCardIds).toHaveLength(0);
  });

  it('无名：葫芦里的 J/Q/K 不计筹码', () => {
    const played = [
      card('s', 13),
      card('h', 13),
      card('c', 13),
      card('d', 7),
      card('s', 7),
    ];
    const r = scoreHand({ ...BASE, played, rule: { debuffFace: true } });
    expect(r.handType).toBe('fullHouse');
    expect(r.chips).toBe(40 + 7 + 7); // 葫芦 40 + 两张 7
    expect(r.debuffedCardIds).toHaveLength(3);
  });

  it('无名不影响 A（A 不算人头牌）', () => {
    const played = [card('s', 14), card('h', 14)];
    const r = scoreHand({ ...BASE, played, rule: { debuffFace: true } });
    expect(r.handType).toBe('pair');
    expect(r.chips).toBe(10 + 11 + 11);
    expect(r.debuffedCardIds).toHaveLength(0);
  });

  it('没有规则与规则为空对象，结果完全一致', () => {
    const a = scoreHand({ ...BASE, played: hearts });
    const b = scoreHand({ ...BASE, played: hearts, rule: {} });
    const c = scoreHand({ ...BASE, played: hearts, rule: null });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('铁律：出 3 张被拒，出满 5 张才结算', () => {
    let s = enterBoss('J', 'decree');
    for (const c of s.hand.slice(0, 3)) {
      s = reducer(s, { type: 'toggleCard', cardId: c.id });
    }
    const blocked = reducer(s, { type: 'playHand' });
    expect(blocked).toBe(s);
    expect(blocked.handsLeft).toBe(4);

    for (const c of s.hand.slice(3, 5)) {
      s = reducer(s, { type: 'toggleCard', cardId: c.id });
    }
    expect(s.selected).toHaveLength(5);
    const played = reducer(s, { type: 'playHand' });
    expect(played.handsLeft).toBe(3);
    expect(played.roundScore).toBeGreaterThan(0);
    expect(played.selected).toHaveLength(0);
    // 铁律只管出牌张数，不改变其余规则：手牌仍然补满
    expect(played.hand.length + played.deck.length + played.discardPile.length).toBe(52);
  });
});

describe('S3 存档版本迁移', () => {
  it('旧存档（无 version / 无 boss 字段）能补齐', () => {
    const s = createRun('OLD');
    const legacy = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete legacy.version;
    delete legacy.bossId;
    delete legacy.bossRule;
    delete legacy.handSize;

    const m = migrateSave(legacy);
    expect(m).not.toBeNull();
    expect(m?.version).toBe(SAVE_VERSION);
    expect(m?.bossId).toBeNull();
    expect(m?.bossRule).toBeNull();
    expect(m?.handSize).toBe(8);
  });

  it('Boss 回合存档 round-trip 后规则不变', () => {
    const s = enterBoss('RT', 'fade');
    const m = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(m?.bossId).toBe('fade');
    expect(m?.bossRule).toEqual(s.bossRule);
    expect(m?.handSize).toBe(s.handSize);
    expect(m?.target).toBe(s.target);
  });

  it('损坏或残缺的存档返回 null，不抛异常', () => {
    expect(migrateSave(null)).toBeNull();
    expect(migrateSave({})).toBeNull();
    expect(migrateSave({ seed: 'x' })).toBeNull();
    expect(migrateSave('not an object')).toBeNull();
  });
});
