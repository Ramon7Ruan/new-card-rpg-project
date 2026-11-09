import { describe, expect, it } from 'vitest';
import { ANTE_TARGETS, MAX_ANTE, targetFor } from '../core/blinds';
import { card } from '../core/cards';
import { initialHandLevels } from '../core/hands';
import { getJoker } from '../core/jokers';
import { scoreHand } from '../core/scoring';
import type { Card, HandType, JokerInstance, RunState } from '../core/types';

/**
 * P4 的平衡核验。
 *
 * 为什么不用「自动打完全局」来验：写过一个贪心 AI（每手枚举最优组合 + 买得起就买），
 * 它连第一个盲注都打不过——因为它**不会弃牌**，8 张手牌里挑不出好牌型。
 * 那测的是「AI 有多聪明」，不是游戏平衡，而且会随 AI 写法漂移。
 *
 * 换成两个能被断言、且不会漂移的问题：
 *   1. 目标曲线本身有没有失控（递增 / 每底注涨幅 / 末位首位比）；
 *   2. **三套成型构筑**（对子 / 人头 / 同花）够不够打过最后一个 Boss，
 *      以及**同样的牌裸手打**够不够——一正一反，证明「买对了才能过」。
 *
 * 构筑价格控制在 $30 以内：三个底注的全部收入大约 $40–60，
 * 所以这些构筑在 P4 的经济下是买得起的，不是纸面强度。
 */

const jokers = (...ids: string[]): JokerInstance[] =>
  ids.map((defId, i) => ({ uid: `j${i}`, defId }));

const levels = (over: Partial<Record<HandType, number>> = {}) => ({
  ...initialHandLevels(),
  ...over,
});

function scoreOf(played: Card[], build: JokerInstance[], handLevels = levels()) {
  return scoreHand({
    played,
    held: [],
    jokers: build,
    handLevels,
    money: 20,
    handsLeft: 3,
    discardsUsed: 0,
    ante: 3,
  });
}

/** 构筑总价（= 商店售价） */
const priceOf = (build: JokerInstance[]) =>
  build.reduce((n, j) => n + (getJoker(j.defId)?.cost ?? 0), 0);

const FLUSH_HAND = [card('h', 2), card('h', 6), card('h', 8), card('h', 10), card('h', 13)];
const PAIR_HAND = [card('s', 14), card('h', 14)];
const TRIPS_HAND = [card('s', 13), card('h', 13), card('d', 13)];

interface Archetype {
  name: string;
  hand: Card[];
  build: JokerInstance[];
  levels: Record<HandType, number>;
  expected: HandType;
}

const ARCHETYPES: Archetype[] = [
  {
    name: '对子流',
    hand: PAIR_HAND,
    build: jokers('pairfan', 'duo', 'jester', 'fission', 'bronze'),
    levels: levels({ pair: 3 }),
    expected: 'pair',
  },
  {
    name: '人头流',
    hand: TRIPS_HAND,
    build: jokers('faceup', 'court-bounty', 'king-tower', 'queen-garden', 'twin'),
    levels: levels({ threeOfAKind: 2 }),
    expected: 'threeOfAKind',
  },
  {
    name: '同花流',
    hand: FLUSH_HAND,
    build: jokers('flushfaith', 'heart-tithe', 'mono-five', 'prism', 'twin'),
    levels: levels({ flush: 2 }),
    expected: 'flush',
  },
];

describe('P4 目标曲线', () => {
  it('3 个底注 × 3 个盲注 = 9 个目标', () => {
    expect(MAX_ANTE).toBe(3);
    expect(ANTE_TARGETS).toHaveLength(3);
    for (const row of ANTE_TARGETS) expect(row).toHaveLength(3);
  });

  it('严格递增（底注内与跨底注都涨）', () => {
    const flat = ANTE_TARGETS.flat();
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i], `第 ${i + 1} 个目标`).toBeGreaterThan(flat[i - 1]);
    }
    expect(targetFor(1, 0)).toBe(flat[0]);
    expect(targetFor(3, 2)).toBe(flat[flat.length - 1]);
  });

  it('每底注起点涨幅 ≤ 2.7×，且每个小步 ≤ 1.6×（防止某一级突然翻几倍）', () => {
    for (let i = 0; i < ANTE_TARGETS.length; i++) {
      const row = ANTE_TARGETS[i];
      const prev = i === 0 ? 300 : ANTE_TARGETS[i - 1][2];
      expect(row[0] / prev, `第 ${i + 1} 底注起点`).toBeLessThanOrEqual(2.7);
      // 同一底注内三档之间也是渐进的（当前是 1.5 / 1.33 左右）
      expect(row[1] / row[0], `第 ${i + 1} 底注 小盲→大盲`).toBeLessThanOrEqual(1.6);
      expect(row[2] / row[1], `第 ${i + 1} 底注 大盲→Boss`).toBeLessThanOrEqual(1.6);
    }
  });

  it('末位 / 首位 ≤ 13×（原验收的 6× 是 2 底注口径，9 个盲注后放宽）', () => {
    const flat = ANTE_TARGETS.flat();
    const ratio = flat[flat.length - 1] / flat[0];
    expect(ratio).toBeGreaterThan(6);
    expect(ratio).toBeLessThanOrEqual(13);
  });
});

describe('P4 三套构筑能不能打过最后一个 Boss', () => {
  const finalTarget = targetFor(MAX_ANTE, 2);

  it.each(ARCHETYPES.map((a) => [a.name, a] as const))(
    '%s：构筑价格 ≤ $30，且 3 手就能清掉最终目标',
    (_name, archetype) => {
      const one = scoreOf(archetype.hand, archetype.build, archetype.levels);
      expect(one.handType).toBe(archetype.expected);
      // 留一手容错：4 次出牌里用 3 次就该够
      expect(one.score * 3).toBeGreaterThanOrEqual(finalTarget);
      expect(priceOf(archetype.build)).toBeLessThanOrEqual(30);
    },
  );

  it('三套构筑的主力牌型互不相同（不是同一个思路的三种写法）', () => {
    const types = new Set(ARCHETYPES.map((a) => a.expected));
    expect(types.size).toBe(3);
  });

  it('空槽（不买任何东西）打不过底注 3 的第一个盲注——成长是必须的', () => {
    // 最理想的裸手：同花、满 4 次出牌全打出同花
    const bareFlush = scoreOf(FLUSH_HAND, []);
    expect(bareFlush.handType).toBe('flush');
    expect(bareFlush.score * 4).toBeLessThan(targetFor(3, 0));

    const barePair = scoreOf(PAIR_HAND, []);
    expect(barePair.score * 4).toBeLessThan(targetFor(3, 0));
  });

  it('同样的一手牌，装上构筑后强度至少翻 10 倍（说明小丑是主战力而不是添头）', () => {
    for (const a of ARCHETYPES) {
      const bare = scoreOf(a.hand, [], a.levels).score;
      const built = scoreOf(a.hand, a.build, a.levels).score;
      expect(built / bare, a.name).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('P4 经济：构筑买得起', () => {
  it('三套构筑的总价都在 $30 以内', () => {
    for (const a of ARCHETYPES) {
      expect(priceOf(a.build), a.name).toBeLessThanOrEqual(30);
    }
  });

  it('每一件构筑件都是真实小丑（id 没写错）', () => {
    for (const a of ARCHETYPES) {
      for (const inst of a.build) expect(getJoker(inst.defId), inst.defId).toBeTruthy();
    }
  });
});

describe('P4 3 底注的推进不依赖旧存档', () => {
  it('新局的 target 仍是第一个盲注的值，底注从 1 开始', () => {
    // 只构造初始 RunState 的最小形状检查，避免与 run.test 重复
    const s: Pick<RunState, 'ante' | 'blindIndex' | 'target'> = {
      ante: 1,
      blindIndex: 0,
      target: targetFor(1, 0),
    };
    expect(s.target).toBe(300);
  });
});
