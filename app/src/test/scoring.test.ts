import { describe, expect, it } from 'vitest';
import { card } from '../core/cards';
import { initialHandLevels } from '../core/hands';
import { scoreHand } from '../core/scoring';
import type { Card, JokerInstance } from '../core/types';

const levels = () => initialHandLevels();

function jokers(...ids: string[]): JokerInstance[] {
  return ids.map((id, i) => ({ uid: `${id}-${i}`, defId: id }));
}

function run(played: Card[], jokerIds: string[] = [], extra: Partial<Parameters<typeof scoreHand>[0]> = {}) {
  return scoreHand({
    played,
    jokers: jokers(...jokerIds),
    handLevels: levels(),
    money: 10,
    handsLeft: 4,
    discardsUsed: 0,
    ante: 1,
    ...extra,
  });
}

/**
 * 黄金用例：给定「手牌 + 小丑序列」，期望一个确定的分数。
 * 这些断言是后续所有重构的护栏，不允许为了让代码跑通而修改。
 */
describe('计分黄金用例', () => {
  it('G1 两对，无小丑 → 92', () => {
    const r = run([card('s', 13), card('h', 13), card('s', 3), card('h', 3), card('c', 7)]);
    expect(r.handType).toBe('twoPair');
    expect(r.chips).toBe(46); // 20 + 10+10+3+3
    expect(r.mult).toBe(2);
    expect(r.score).toBe(92);
  });

  it('G2 一对 A + 小丑(+4) → 192', () => {
    const r = run([card('s', 14), card('h', 14)], ['jester']);
    expect(r.chips).toBe(32); // 10 + 11 + 11
    expect(r.mult).toBe(6); // 2 + 4
    expect(r.score).toBe(192);
  });

  it('G3 顺序决定结果：小丑在前 → 576', () => {
    const r = run([card('s', 14), card('h', 14)], ['jester', 'prism']);
    expect(r.chips).toBe(32);
    expect(r.mult).toBe(18); // (2+4)*3
    expect(r.score).toBe(576);
  });

  it('G3b 顺序决定结果：棱镜在前 → 320', () => {
    const r = run([card('s', 14), card('h', 14)], ['prism', 'jester']);
    expect(r.mult).toBe(10); // 2*3+4
    expect(r.score).toBe(320);
  });

  it('G4 同花 + 同花信(+15) → 1292', () => {
    const r = run(
      [card('s', 2), card('s', 5), card('s', 7), card('s', 9), card('s', 11)],
      ['flushfaith'],
    );
    expect(r.chips).toBe(68); // 35 + 33
    expect(r.mult).toBe(19);
    expect(r.score).toBe(1292);
  });

  it('G5 顺子 + 顺子匠(+30筹码 +10倍率) → 1330', () => {
    const r = run(
      [card('s', 5), card('h', 6), card('d', 7), card('c', 8), card('s', 9)],
      ['smith'],
    );
    expect(r.chips).toBe(95); // 30 + 35 + 30
    expect(r.mult).toBe(14);
    expect(r.score).toBe(1330);
  });

  it('G6 单张 A + 独行(+20) → 336', () => {
    const r = run([card('s', 14)], ['solo']);
    expect(r.chips).toBe(16); // 5 + 11
    expect(r.mult).toBe(21);
    expect(r.score).toBe(336);
  });

  it('G7 五张高牌 + 极端(×2) → 30', () => {
    const r = run(
      [card('s', 2), card('h', 5), card('d', 7), card('c', 9), card('s', 12)],
      ['extremist'],
    );
    expect(r.chips).toBe(15); // 5 + 10（只有 Q 计分）
    expect(r.mult).toBe(2);
    expect(r.score).toBe(30);
  });

  it('G8 弃牌客：每弃 1 次 +4，弃了 2 次 → 300', () => {
    const r = run([card('s', 13), card('h', 13)], ['discarder'], { discardsUsed: 2 });
    expect(r.chips).toBe(30);
    expect(r.mult).toBe(10); // 2 + 8
    expect(r.score).toBe(300);
  });

  it('G9 空手：剩 3 次出牌，每次 +5 → 510', () => {
    const r = run([card('s', 13), card('h', 13)], ['emptyhand'], { handsLeft: 3 });
    expect(r.mult).toBe(17);
    expect(r.score).toBe(510);
  });

  it('G10 积木：3 张牌各 +8 → 108', () => {
    const r = run([card('s', 13), card('h', 13), card('s', 3)], ['block']);
    expect(r.chips).toBe(54); // 10 + 20 + 24
    expect(r.score).toBe(108);
  });

  it('G11 黑桃法：5 张黑桃各 +15 → 572', () => {
    const r = run(
      [card('s', 2), card('s', 5), card('s', 7), card('s', 9), card('s', 11)],
      ['spadelaw'],
    );
    expect(r.chips).toBe(143); // 35 + 33 + 75
    expect(r.mult).toBe(4);
    expect(r.score).toBe(572);
  });

  it('G12 面朝上：K/Q/J 各 +3，但只算打出的牌 → 150', () => {
    const r = run(
      [card('s', 13), card('h', 12), card('d', 11), card('c', 9), card('s', 2)],
      ['faceup'],
    );
    expect(r.chips).toBe(15); // 5 + 10（只有 K 计分）
    expect(r.mult).toBe(10); // 1 + 9
    expect(r.score).toBe(150);
  });

  it('事件流末端与最终分数一致', () => {
    const r = run([card('s', 14), card('h', 14)], ['jester', 'prism']);
    const last = r.events[r.events.length - 1];
    expect(last.chipsAfter).toBe(r.chips);
    expect(last.multAfter).toBe(r.mult);
    expect(last.chipsAfter * last.multAfter).toBe(r.score);
  });

  it('事件流第一项是牌型基础值', () => {
    const r = run([card('s', 14), card('h', 14)]);
    expect(r.events[0].kind).toBe('hand');
    expect(r.events[0].chipsDelta).toBe(10);
    expect(r.events[0].multDelta).toBe(2);
  });
});

/**
 * 黄金用例 G16–G25：P2 新增的增强 / 蜡封组合。
 * 与 G1–G15 同级：数字是契约，重构不能动。
 */
describe('增强黄金用例', () => {
  it('G16 一对 A + 两张附加 → 92 × 2 = 184', () => {
    const r = run([card('s', 14, 'bonus'), card('h', 14, 'bonus')]);
    expect(r.chips).toBe(92); // 10 + (11+30) × 2
    expect(r.score).toBe(184);
  });

  it('G17 一对 A，一张倍率 → 32 × 6 = 192', () => {
    const r = run([card('s', 14, 'mult'), card('h', 14)]);
    expect(r.mult).toBe(6);
    expect(r.score).toBe(192);
  });

  it('G18 一对 A，一张裂隙 → 32 × 4 = 128', () => {
    const r = run([card('s', 14, 'glass'), card('h', 14)]);
    expect(r.score).toBe(128);
  });

  it('G19 一对 A + 留手铸铁 → 32 × 3 = 96', () => {
    const r = run([card('s', 14), card('h', 14)], [], { held: [card('s', 13, 'steel')] });
    expect(r.mult).toBe(3);
    expect(r.score).toBe(96);
  });

  it('G20 一对 A，♠A 附加 + 朱砂 → 103 × 2 = 206', () => {
    const r = run([card('s', 14, 'bonus', 'red'), card('h', 14)]);
    expect(r.chips).toBe(103); // 10 + 41 + 41 + 11
    expect(r.score).toBe(206);
  });

  it('G21 一对 A，♠A 金砂 → 分数不变，另得 $3', () => {
    const r = run([card('s', 14, undefined, 'gold'), card('h', 14)]);
    expect(r.score).toBe(64);
    expect(r.money).toBe(3);
  });

  it('G22 四张红心 + 幻形黑桃 K → 同花 60 × 4 = 240', () => {
    const r = run([
      card('h', 2),
      card('h', 3),
      card('h', 4),
      card('h', 6),
      card('s', 13, 'wild'),
    ]);
    expect(r.handType).toBe('flush');
    expect(r.chips).toBe(60); // 35 + 2+3+4+6 + 10
    expect(r.score).toBe(240);
  });

  it('G23 一对 A，裂隙 + 棱镜(×3) → 32 × 12 = 384', () => {
    const r = run([card('s', 14, 'glass'), card('h', 14)], ['prism']);
    expect(r.mult).toBe(12);
    expect(r.score).toBe(384);
  });

  it('G24 一对 A + 两张附加 + 小丑(+4) → 92 × 6 = 552', () => {
    const r = run([card('s', 14, 'bonus'), card('h', 14, 'bonus')], ['jester']);
    expect(r.chips).toBe(92);
    expect(r.mult).toBe(6);
    expect(r.score).toBe(552);
  });

  it('G25 三条 K（两张附加）→ 120 × 3 = 360', () => {
    const r = run([card('s', 13, 'bonus'), card('h', 13, 'bonus'), card('d', 13)]);
    expect(r.handType).toBe('threeOfAKind');
    expect(r.chips).toBe(120); // 30 + 30 + 60
    expect(r.score).toBe(360);
  });
});
