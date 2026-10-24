import { describe, expect, it } from 'vitest';
import { targetFor } from '../core/blinds';
import { card, sortHand } from '../core/cards';
import { createRun, HANDS_PER_ROUND, reducer } from '../core/run';
import type { RunState } from '../core/types';

function startPlaying(seed = 'TESTSEED'): RunState {
  let s = createRun(seed);
  s = reducer(s, { type: 'selectBlind' });
  return s;
}

/** 一路推进到「打完本盲注并收完款」，返回 shop 态 */
function finishRound(s: RunState): RunState {
  let t: RunState = { ...s, target: 1, phase: 'playing' };
  t = reducer(t, { type: 'toggleCard', cardId: t.hand[0].id });
  t = reducer(t, { type: 'playHand' });
  return reducer(t, { type: 'cashOut' });
}

describe('单局状态机', () => {
  it('新局：$4，8 张牌总数守恒', () => {
    const s = createRun('A');
    expect(s.money).toBe(4);
    expect(s.phase).toBe('blindSelect');
    expect(s.deck.length).toBe(52);
    expect(s.target).toBe(300);
  });

  it('选择盲注后发 8 张手牌，总数仍为 52', () => {
    const s = startPlaying();
    expect(s.phase).toBe('playing');
    expect(s.hand).toHaveLength(8);
    expect(s.deck.length + s.hand.length + s.discardPile.length).toBe(52);
    const ids = new Set([...s.deck, ...s.hand].map((c) => c.id));
    expect(ids.size).toBe(s.deck.length + s.hand.length);
  });

  it('同种子发牌完全一致', () => {
    const a = startPlaying('SAME');
    const b = startPlaying('SAME');
    expect(a.hand.map((c) => c.id)).toEqual(b.hand.map((c) => c.id));
  });

  it('出牌消耗一次机会并补满手牌', () => {
    let s = startPlaying();
    s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
    s = reducer(s, { type: 'playHand' });
    expect(s.handsLeft).toBe(HANDS_PER_ROUND - 1);
    expect(s.selected).toHaveLength(0);
    if (s.phase === 'playing') {
      expect(s.hand).toHaveLength(8);
      expect(s.deck.length + s.hand.length + s.discardPile.length).toBe(52);
    }
  });

  it('弃牌进入弃牌堆并补满，弃牌次数递减', () => {
    let s = startPlaying();
    s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
    const discardedId = s.hand[0].id;
    s = reducer(s, { type: 'discard' });
    expect(s.discardsLeft).toBe(2);
    expect(s.discardsUsed).toBe(1);
    expect(s.discardPile.some((c) => c.id === discardedId)).toBe(true);
    expect(s.hand).toHaveLength(8);
  });

  it('一次最多选 5 张', () => {
    let s = startPlaying();
    for (const c of s.hand) s = reducer(s, { type: 'toggleCard', cardId: c.id });
    expect(s.selected).toHaveLength(5);
  });

  it('出牌机会用尽且未达标 → lost', () => {
    let s = startPlaying();
    s = { ...s, target: 999999, handsLeft: 1 };
    s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
    s = reducer(s, { type: 'playHand' });
    expect(s.phase).toBe('lost');
  });

  it('达标 → cashOut，结算后进入商店', () => {
    let s = startPlaying();
    s = { ...s, target: 1 };
    s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
    s = reducer(s, { type: 'playHand' });
    expect(s.phase).toBe('cashOut');

    const before = s.money;
    s = reducer(s, { type: 'cashOut' });
    expect(s.phase).toBe('shop');
    expect(s.money).toBeGreaterThan(before);
    expect(s.shop?.offers.length).toBe(2);
  });

  it('钱不够不能买小丑', () => {
    let s = startPlaying();
    s = { ...s, target: 1 };
    s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
    s = reducer(s, { type: 'playHand' });
    s = reducer(s, { type: 'cashOut' });
    s = { ...s, money: 0 };
    const next = reducer(s, { type: 'buyJoker', index: 0 });
    expect(next.jokers).toHaveLength(0);
    expect(next.money).toBe(0);
  });

  it('买了小丑后槽位与金钱同步变化，不能重复买同一格', () => {
    let s = startPlaying();
    s = { ...s, target: 1, money: 100 };
    s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
    s = reducer(s, { type: 'playHand' });
    s = reducer(s, { type: 'cashOut' });
    const cost = s.shop!.offers[0].cost;
    s = reducer(s, { type: 'buyJoker', index: 0 });
    expect(s.jokers).toHaveLength(1);
    expect(s.money).toBe(100 + 3 + s.handsLeft * 1 + Math.min(Math.floor(100 / 5), 5) - cost);
    const again = reducer(s, { type: 'buyJoker', index: 0 });
    expect(again.jokers).toHaveLength(1);
  });

  it('reroll 涨价且花钱', () => {
    let s = startPlaying();
    s = { ...s, target: 1, money: 100 };
    s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
    s = reducer(s, { type: 'playHand' });
    s = reducer(s, { type: 'cashOut' });
    const moneyBefore = s.money;
    s = reducer(s, { type: 'reroll' });
    expect(s.money).toBe(moneyBefore - 5);
    expect(s.shop?.rerollCost).toBe(6);
  });

  it('推进顺序：3 个盲注后进入下一底注，目标逐级提高', () => {
    const seen: string[] = [];
    let s = startPlaying();

    for (let i = 0; i < 6; i++) {
      seen.push(`a${s.ante}b${s.blindIndex}=${s.target}`);
      s = reducer(finishRound(s), { type: 'leaveShop' });
      if (i < 5) s = reducer(s, { type: 'selectBlind' });
    }

    expect(seen).toEqual([
      'a1b0=300',
      'a1b1=450',
      'a1b2=600',
      'a2b0=800',
      'a2b1=1200',
      'a2b2=1600',
    ]);
    // 最后一个底注的 Boss 打完即通关，不再进商店
    expect(s.phase).toBe('won');
  });

  it('底注与盲注越界时 targetFor 取最后一个底注的值', () => {
    expect(targetFor(3, 0)).toBe(800);
    expect(targetFor(99, 2)).toBe(1600);
  });

  it('上一手的得分不带到下一个盲注', () => {
    let s = finishRound(startPlaying());
    expect(s.lastScore).not.toBeNull();
    s = reducer(s, { type: 'leaveShop' });
    expect(s.lastScore).toBeNull();
    expect(s.roundScore).toBe(0);
  });
});

describe('手牌自动排序', () => {
  it('发牌后点数升序（A 最大排最右）', () => {
    for (const seed of ['S1', 'S2', 'S3', 'S4', 'S5']) {
      const s = startPlaying(seed);
      const ranks = s.hand.map((c) => c.rank);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it('出牌补牌后仍然有序', () => {
    let s = startPlaying('SORT');
    s = reducer(s, { type: 'toggleCard', cardId: s.hand[2].id });
    s = reducer(s, { type: 'playHand' });
    if (s.phase === 'playing') {
      const ranks = s.hand.map((c) => c.rank);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it('sortHand：点数升序，同点数按 黑桃→红桃→梅花→方块', () => {
    const input = [card('d', 14), card('c', 5), card('s', 5), card('h', 5), card('d', 5), card('s', 2)];
    const sorted = sortHand(input);
    expect(sorted.map((c) => c.id)).toEqual([
      'spade-2',
      'spade-5',
      'heart-5',
      'club-5',
      'diamond-5',
      'diamond-14',
    ]);
    // 不修改入参
    expect(input[0].id).toBe('diamond-14');
  });
});
