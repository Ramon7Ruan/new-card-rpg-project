import { describe, expect, it } from 'vitest';
import { BOSSES } from '../core/blinds';
import { migrateSave } from '../core/persist';
import { createRun, reducer } from '../core/run';
import type { RunState } from '../core/types';

/**
 * 总体验收：不看单个函数的返回值，只看"一局能不能从头走到尾"。
 */

function enterBoss(seed: string, bossId: string, ante = 1): RunState {
  let s = createRun(seed);
  s = { ...s, ante, blindIndex: 2 };
  return reducer(s, { type: 'selectBlind', bossId });
}

function countCards(s: RunState): number {
  return s.deck.length + s.hand.length + s.discardPile.length;
}

describe('E2E：6 个 Boss 各自能完整走一手', () => {
  for (const boss of BOSSES) {
    it(`${boss.name}：进入 → 出牌 → 结算，状态自洽`, () => {
      let s = enterBoss('E2E', boss.id);
      expect(s.phase).toBe('playing');
      expect(s.bossId).toBe(boss.id);
      expect(countCards(s)).toBe(52);

      const need = s.bossRule?.requirePlayedCards ?? Math.min(5, s.hand.length);
      for (const c of s.hand.slice(0, need)) {
        s = reducer(s, { type: 'toggleCard', cardId: c.id });
      }
      s = reducer(s, { type: 'playHand' });

      expect(s.handsLeft).toBe(3);
      expect(s.roundScore).toBeGreaterThan(0);
      expect(s.selected).toHaveLength(0);
      expect(countCards(s)).toBe(52);
      // 打了 5 张牌，牌堆/手牌/弃牌之间只是流动，总数不能变
      expect(s.discardPile.length).toBe(need);
    });
  }
});

describe('E2E：完整一局（2 底注 × 3 盲注）', () => {
  it('六个盲注顺序正确，最后进入 won', () => {
    let s = createRun('E2E-RUN');
    const visits: string[] = [];

    for (let i = 0; i < 6; i++) {
      visits.push(`a${s.ante}b${s.blindIndex}`);
      s = reducer(s, { type: 'selectBlind' });
      expect(s.phase).toBe('playing');

      // 本回合目标压到 1，专注验证流程而不是数值
      s = { ...s, target: 1 };
      const need = s.bossRule?.requirePlayedCards ?? Math.min(5, s.hand.length);
      for (const c of s.hand.slice(0, need)) {
        s = reducer(s, { type: 'toggleCard', cardId: c.id });
      }
      s = reducer(s, { type: 'playHand' });
      expect(s.phase).toBe('cashOut');

      s = reducer(s, { type: 'cashOut' });
      if (s.phase === 'shop') s = reducer(s, { type: 'leaveShop' });
    }

    expect(visits).toEqual(['a1b0', 'a1b1', 'a1b2', 'a2b0', 'a2b1', 'a2b2']);
    expect(s.phase).toBe('won');
  });

  it('中途存档 → 读回 → 继续能打完', () => {
    let s = createRun('E2E-SAVE');

    // 先过两个盲注，制造非初始状态
    for (let i = 0; i < 2; i++) {
      s = reducer(s, { type: 'selectBlind' });
      s = { ...s, target: 1 };
      for (const c of s.hand.slice(0, 5)) {
        s = reducer(s, { type: 'toggleCard', cardId: c.id });
      }
      s = reducer(s, { type: 'playHand' });
      s = reducer(s, { type: 'cashOut' });
      s = reducer(s, { type: 'leaveShop' });
    }

    // 进 Boss 后存档、读回
    s = reducer(s, { type: 'selectBlind', bossId: 'fade' });
    const restored = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(restored).not.toBeNull();
    s = restored as RunState;
    expect(s.bossId).toBe('fade');
    expect(s.phase).toBe('playing');
    expect(countCards(s)).toBe(52);

    // 读档后继续打完本盲注
    s = { ...s, target: 1 };
    for (const c of s.hand.slice(0, 5)) {
      s = reducer(s, { type: 'toggleCard', cardId: c.id });
    }
    s = reducer(s, { type: 'playHand' });
    expect(s.phase).toBe('cashOut');
  });
});

describe('E2E：失败路径', () => {
  it('出牌次数耗尽且未达标 → lost', () => {
    let s = createRun('E2E-LOSE');
    s = reducer(s, { type: 'selectBlind' });
    s = { ...s, target: 999999, handsLeft: 1 };
    s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
    s = reducer(s, { type: 'playHand' });
    expect(s.phase).toBe('lost');
  });
});
