import { describe, expect, it } from 'vitest';
import { card } from '../core/cards';
import { evaluateHand } from '../core/handEval';

describe('牌型识别', () => {
  it('高牌：取单张最大牌计分', () => {
    const r = evaluateHand([card('s', 14), card('h', 9), card('d', 4)]);
    expect(r.type).toBe('highCard');
    expect(r.scoringCardIds).toEqual(['spade-14']);
  });

  it('对子：两张 K 计分，第三张不参与', () => {
    const r = evaluateHand([card('s', 13), card('h', 13), card('s', 3), card('h', 7), card('c', 9)]);
    expect(r.type).toBe('pair');
    expect(r.scoringCardIds.sort()).toEqual(['heart-13', 'spade-13']);
  });

  it('两对：四张全计分', () => {
    const r = evaluateHand([card('s', 13), card('h', 13), card('s', 3), card('h', 3), card('c', 7)]);
    expect(r.type).toBe('twoPair');
    expect(r.scoringCardIds).toHaveLength(4);
  });

  it('三条', () => {
    const r = evaluateHand([card('s', 13), card('h', 13), card('d', 13), card('s', 3), card('c', 7)]);
    expect(r.type).toBe('threeOfAKind');
    expect(r.scoringCardIds).toHaveLength(3);
  });

  it('顺子（杂色）', () => {
    const r = evaluateHand([card('s', 5), card('h', 6), card('d', 7), card('c', 8), card('s', 9)]);
    expect(r.type).toBe('straight');
    expect(r.scoringCardIds).toHaveLength(5);
  });

  it('A 作 1 的顺子 A-2-3-4-5', () => {
    const r = evaluateHand([card('s', 14), card('h', 2), card('d', 3), card('c', 4), card('s', 5)]);
    expect(r.type).toBe('straight');
  });

  it('A 作 14 的顺子 10-J-Q-K-A', () => {
    const r = evaluateHand([card('s', 10), card('h', 11), card('d', 12), card('c', 13), card('s', 14)]);
    expect(r.type).toBe('straight');
  });

  it('同花', () => {
    const r = evaluateHand([card('s', 2), card('s', 5), card('s', 7), card('s', 9), card('s', 11)]);
    expect(r.type).toBe('flush');
    expect(r.scoringCardIds).toHaveLength(5);
  });

  it('葫芦：五张全计分', () => {
    const r = evaluateHand([card('s', 13), card('h', 13), card('d', 13), card('s', 3), card('h', 3)]);
    expect(r.type).toBe('fullHouse');
    expect(r.scoringCardIds).toHaveLength(5);
  });

  it('四条：只有四张计分，踢脚不计', () => {
    const r = evaluateHand([card('s', 13), card('h', 13), card('d', 13), card('c', 13), card('h', 3)]);
    expect(r.type).toBe('fourOfAKind');
    expect(r.scoringCardIds).toHaveLength(4);
  });

  it('同花顺', () => {
    const r = evaluateHand([card('s', 5), card('s', 6), card('s', 7), card('s', 8), card('s', 9)]);
    expect(r.type).toBe('straightFlush');
  });

  it('4 张牌不判顺子', () => {
    const r = evaluateHand([card('s', 5), card('h', 6), card('d', 7), card('c', 8)]);
    expect(r.type).toBe('highCard');
  });

  it('4 张牌可以判两对', () => {
    const r = evaluateHand([card('s', 5), card('h', 5), card('d', 7), card('c', 7)]);
    expect(r.type).toBe('twoPair');
    expect(r.scoringCardIds).toHaveLength(4);
  });

  it('不成顺的高牌', () => {
    const r = evaluateHand([card('s', 13), card('h', 12), card('d', 11), card('c', 9), card('s', 2)]);
    expect(r.type).toBe('highCard');
  });

  it('五张同点数同花色判同花五', () => {
    const r = evaluateHand([card('s', 13), card('s', 13), card('s', 13), card('s', 13), card('s', 13)]);
    expect(r.type).toBe('flushFive');
  });

  it('同花葫芦', () => {
    const r = evaluateHand([card('s', 13), card('s', 13), card('s', 13), card('s', 3), card('s', 3)]);
    expect(r.type).toBe('flushHouse');
  });
});
