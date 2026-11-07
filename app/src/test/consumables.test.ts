import { describe, expect, it } from 'vitest';
import { card } from '../core/cards';
import {
  CONSUMABLES,
  CONSUMABLE_COST,
  getConsumable,
  MAX_CONSUMABLES,
} from '../core/consumables';
import {
  ALL_HAND_TYPES,
  baseFor,
  HAND_BASE,
  HAND_LEVEL_GAIN,
  initialHandLevels,
} from '../core/hands';
import { migrateSave } from '../core/persist';
import { createRun, reducer, SAVE_VERSION } from '../core/run';
import { scoreHand } from '../core/scoring';
import type { HandType, RunState } from '../core/types';

function playing(seed = 'CONSUM'): RunState {
  return reducer(createRun(seed), { type: 'selectBlind' });
}

function give(s: RunState, ...defIds: string[]): RunState {
  return {
    ...s,
    consumables: defIds.map((defId, i) => ({ uid: `${defId}-${i}`, defId })),
  };
}

const pairOfAces = [card('s', 14), card('h', 14)];

function scoreAt(pairLevel: number): number {
  const levels = initialHandLevels();
  levels.pair = pairLevel;
  return scoreHand({
    played: pairOfAces,
    jokers: [],
    handLevels: levels,
    money: 10,
    handsLeft: 4,
    discardsUsed: 0,
    ante: 1,
  }).score;
}

// ── S1 契约升级与迁移 ────────────────────────────────────────────

describe('S1 存档版本 3：旧存档迁移', () => {
  const legacy = () => {
    const raw = JSON.parse(JSON.stringify(createRun('LEGACY'))) as Record<string, unknown>;
    delete raw.version;
    delete raw.consumables;
    delete raw.handLevels;
    return raw;
  };

  it('无 version / 无 consumables / 无 handLevels → 补齐后可用', () => {
    const m = migrateSave(legacy());
    expect(m).not.toBeNull();
    expect(m?.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(3);
    expect(m?.consumables).toEqual([]);
    expect(Object.values(m?.handLevels ?? {})).toEqual(Array(12).fill(1));
  });

  it('旧商店商品没有 kind，一律按 joker 补', () => {
    const raw = legacy();
    raw.shop = { offers: [{ defId: 'jester', cost: 2, sold: false }], rerollCost: 5, rerolls: 0 };
    const m = migrateSave(raw);
    expect(m?.shop?.offers[0].kind).toBe('joker');
    expect(m?.shop?.offers[0].cost).toBe(2);
  });

  it('handLevels 只缺一部分时，缺的补 1、有的保留', () => {
    const raw = legacy();
    raw.handLevels = { pair: 4 };
    const m = migrateSave(raw);
    expect(m?.handLevels.pair).toBe(4);
    expect(m?.handLevels.highCard).toBe(1);
    expect(m?.handLevels.flushFive).toBe(1);
  });

  it('未知 defId 的消耗品被丢弃，超过上限的截断', () => {
    const base = createRun('DROP');
    const raw = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    raw.consumables = [
      { uid: 'a', defId: 'inscribe-pair' },
      { uid: 'b', defId: 'no-such-item' },
    ];
    expect(migrateSave(raw)?.consumables.map((c) => c.defId)).toEqual(['inscribe-pair']);

    raw.consumables = [
      { uid: 'a', defId: 'inscribe-pair' },
      { uid: 'b', defId: 'inscribe-flush' },
      { uid: 'c', defId: 'inscribe-straight' },
    ];
    expect(migrateSave(raw)?.consumables).toHaveLength(MAX_CONSUMABLES);
  });

  it('带消耗品与等级的存档 round-trip 后完全一致', () => {
    const s = give(
      { ...playing('RT'), handLevels: { ...initialHandLevels(), pair: 3 } },
      'inscribe-flush',
    );
    const m = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(m?.consumables).toEqual(s.consumables);
    expect(m?.handLevels).toEqual(s.handLevels);
  });
});

// ── S2 等级增量表 ────────────────────────────────────────────────

describe('S2 baseFor：1 级不变，逐级叠加', () => {
  it('12 种牌型 1 级严格等于 HAND_BASE', () => {
    for (const type of ALL_HAND_TYPES) {
      expect(baseFor(type, 1)).toEqual(HAND_BASE[type]);
    }
  });

  it('3 级 = base + 2 × 每级增量', () => {
    for (const type of ALL_HAND_TYPES) {
      const gain = HAND_LEVEL_GAIN[type];
      const base = HAND_BASE[type];
      expect(baseFor(type, 3)).toEqual({
        chips: base.chips + gain.chips * 2,
        mult: base.mult + gain.mult * 2,
      });
    }
  });

  it('等级 0 / 负数 / NaN 都按 1 级处理', () => {
    for (const bad of [0, -3, Number.NaN]) {
      expect(baseFor('pair', bad)).toEqual(HAND_BASE.pair);
    }
  });

  it('升级真的改变分数：对子 A 从 64 → 150 → 272', () => {
    expect(scoreAt(1)).toBe(64); // (10+11+11) × 2
    expect(scoreAt(2)).toBe(150); // (28+22) × 3
    expect(scoreAt(3)).toBe(272); // (46+22) × 4
  });

  it('每级增量本身大于 0（不存在升了不涨的牌型）', () => {
    for (const type of ALL_HAND_TYPES) {
      const g = HAND_LEVEL_GAIN[type];
      expect(g.chips + g.mult).toBeGreaterThan(0);
    }
  });
});

// ── S3 铭文数据表 ───────────────────────────────────────────────

describe('S3 铭文数据表', () => {
  it('12 张，id 与目标牌型都不重复，且覆盖全部牌型', () => {
    expect(CONSUMABLES).toHaveLength(12);
    expect(new Set(CONSUMABLES.map((c) => c.id)).size).toBe(12);
    const targets = CONSUMABLES.map((c) => c.target);
    expect(new Set(targets).size).toBe(12);
    expect(new Set(targets)).toEqual(new Set(ALL_HAND_TYPES));
  });

  it('每张都有正价格，描述里写明加成数值', () => {
    for (const c of CONSUMABLES) {
      expect(c.cost).toBe(CONSUMABLE_COST);
      expect(c.cost).toBeGreaterThan(0);
      const gain = HAND_LEVEL_GAIN[c.target as HandType];
      expect(c.desc).toContain(String(gain.chips));
      expect(c.desc).toContain(String(gain.mult));
    }
  });

  it('getConsumable 能按 id 取到，未知 id 返回 undefined', () => {
    expect(getConsumable('inscribe-pair')?.target).toBe('pair');
    expect(getConsumable('inscribe-nope')).toBeUndefined();
  });
});

// ── S4 使用流程 ─────────────────────────────────────────────────

describe('S4 useConsumable', () => {
  it('只升目标牌型，其他 11 种不动', () => {
    let s = give(playing(), 'inscribe-flush');
    s = reducer(s, { type: 'useConsumable', index: 0 });

    expect(s.handLevels.flush).toBe(2);
    for (const type of ALL_HAND_TYPES) {
      if (type !== 'flush') expect(s.handLevels[type]).toBe(1);
    }
  });

  it('用掉后从槽位移除', () => {
    let s = give(playing(), 'inscribe-pair', 'inscribe-flush');
    s = reducer(s, { type: 'useConsumable', index: 0 });
    expect(s.consumables.map((c) => c.defId)).toEqual(['inscribe-flush']);
  });

  it('连用两张同种 → 3 级', () => {
    let s = give(playing(), 'inscribe-pair', 'inscribe-pair');
    s = reducer(s, { type: 'useConsumable', index: 0 });
    s = reducer(s, { type: 'useConsumable', index: 0 });
    expect(s.handLevels.pair).toBe(3);
    expect(s.consumables).toHaveLength(0);
  });

  it('盲注选择页不可用（避免在没牌桌时改数值）', () => {
    const s = give(createRun('NOUSE'), 'inscribe-pair');
    const after = reducer(s, { type: 'useConsumable', index: 0 });
    expect(after).toBe(s);
  });

  it('商店页可用（买完立刻用是正常操作）', () => {
    const s = give({ ...playing('SHOPUSE'), phase: 'shop' }, 'inscribe-pair');
    const after = reducer(s, { type: 'useConsumable', index: 0 });
    expect(after.handLevels.pair).toBe(2);
  });

  it('越界索引无操作，不抛异常', () => {
    const s = give(playing(), 'inscribe-pair');
    expect(reducer(s, { type: 'useConsumable', index: 5 })).toBe(s);
    expect(reducer(s, { type: 'useConsumable', index: -1 })).toBe(s);
  });

  it('使用后同一手牌的预览分数同步升高', () => {
    let s = give(playing('PREVIEWLV'), 'inscribe-pair');
    const levels = { ...s.handLevels, pair: 1 };
    const before = scoreHand({
      played: pairOfAces,
      jokers: [],
      handLevels: levels,
      money: 10,
      handsLeft: 4,
      discardsUsed: 0,
      ante: 1,
    }).score;
    s = reducer(s, { type: 'useConsumable', index: 0 });
    const after = scoreHand({
      played: pairOfAces,
      jokers: [],
      handLevels: s.handLevels,
      money: 10,
      handsLeft: 4,
      discardsUsed: 0,
      ante: 1,
    }).score;
    expect(after).toBeGreaterThan(before);
  });
});
