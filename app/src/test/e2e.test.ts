import { describe, expect, it } from 'vitest';
import { BOSSES } from '../core/blinds';
import { card } from '../core/cards';
import { getConsumable } from '../core/consumables';
import { initialHandLevels } from '../core/hands';
import { getJoker } from '../core/jokers';
import { migrateSave } from '../core/persist';
import { createRun, reducer } from '../core/run';
import { scoreHand } from '../core/scoring';
import { rollShop, sellValue } from '../core/shop';
import type { RunState, ShopState } from '../core/types';

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

/** 从真实商店 roll 里找出一个带「星球（铭文）」位的货架，避免测试里手写假商品 */
function findPlanetShop(seed: string): { shop: ShopState; index: number } {
  for (let nonce = 0; nonce < 200; nonce++) {
    const shop = rollShop(seed, nonce);
    const index = shop.consumables.findIndex((o) => !!getConsumable(o.defId)?.target);
    if (index >= 0) return { shop, index };
  }
  throw new Error('200 次 roll 都没有星球位，消耗品池权重有问题');
}

function toFirstShop(): RunState {
  let s = reducer(createRun('P1FLOW'), { type: 'selectBlind' });
  s = { ...s, target: 1, money: 40 };
  s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
  s = reducer(s, { type: 'playHand' });
  return reducer(s, { type: 'cashOut' });
}

describe('E2E：P1 闭环（买铭文 → 使用 → 等级生效 → 存档 → 下一盲注）', () => {
  it('等级提升跨盲注与存档都保留', () => {
    let s = toFirstShop();
    expect(s.phase).toBe('shop');

    const { shop, index } = findPlanetShop('P1FLOW');
    s = { ...s, shop: { ...shop, rerollCost: 5, rerolls: 0 } };

    const offer = s.shop!.consumables[index];
    const def = getConsumable(offer.defId);
    expect(def?.target).toBeTruthy();
    const target = def!.target!;
    const before = s.handLevels[target];
    const moneyBefore = s.money;

    s = reducer(s, { type: 'buyConsumable', index });
    expect(s.consumables).toHaveLength(1);
    expect(s.money).toBe(moneyBefore - offer.cost);

    s = reducer(s, { type: 'useConsumable', index: 0 });
    expect(s.handLevels[target]).toBe(before + 1);
    expect(s.consumables).toHaveLength(0);

    const restored = migrateSave(JSON.parse(JSON.stringify(s))) as RunState;
    expect(restored.handLevels[target]).toBe(before + 1);

    s = reducer(restored, { type: 'leaveShop' });
    expect(s.phase).toBe('blindSelect');
    s = reducer(s, { type: 'selectBlind' });
    expect(s.handLevels[target]).toBe(before + 1);
    expect(s.phase).toBe('playing');
  });

  it('升级后同一手牌的分数确实变高（走真实计分）', () => {
    const levels = initialHandLevels();
    const played = [card('s', 14), card('h', 14)];
    const base = scoreHand({
      played,
      jokers: [],
      handLevels: levels,
      money: 0,
      handsLeft: 4,
      discardsUsed: 0,
      ante: 1,
    }).score;

    levels.pair += 1;
    const up = scoreHand({
      played,
      jokers: [],
      handLevels: levels,
      money: 0,
      handsLeft: 4,
      discardsUsed: 0,
      ante: 1,
    }).score;

    expect(up).toBeGreaterThan(base);
  });

  it('小丑槽满时卖出换位：真实商店里买 → 卖 → 再买', () => {
    let s = toFirstShop();
    // 小丑货架固定 3 张，取第一张
    const jokerIndex = 0;
    expect(s.shop!.jokers.length).toBe(3);

    // 先塞满 5 个槽
    s = {
      ...s,
      money: 40,
      jokers: ['jester', 'twin', 'prism', 'bronze', 'stone'].map((defId, i) => ({
        uid: `j-${i}`,
        defId,
      })),
    };

    const cost = s.shop!.jokers[jokerIndex].cost;
    const moneyBefore = s.money;
    const blocked = reducer(s, { type: 'buyJoker', index: jokerIndex });
    expect(blocked).toBe(s);

    s = reducer(s, { type: 'sellJoker', index: 0 });
    expect(s.jokers).toHaveLength(4);

    s = reducer(s, { type: 'buyJoker', index: jokerIndex });
    expect(s.jokers).toHaveLength(5);
    expect(s.jokers[4].defId).toBe(s.shop!.jokers[jokerIndex].defId);
    expect(s.money).toBe(moneyBefore + sellValue(getJoker('jester')!.cost) - cost);
    expect(countCards(s)).toBe(52);
  });
});
