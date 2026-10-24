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
