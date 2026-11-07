import { MAX_ANTE, resolveBoss, rewardFor, targetFor } from './blinds';
import { createDeck, sortHand } from './cards';

import { initialHandLevels } from './hands';
import { getJoker, MAX_JOKERS } from './jokers';
import { makeRng, randomSeed, shuffle } from './rng';
import { scoreHand } from './scoring';
import { rollShop } from './shop';
import type { BlindRule, Card, RunState } from './types';

export const HAND_SIZE = 8;
export const HANDS_PER_ROUND = 4;
export const DISCARDS_PER_ROUND = 3;
export const INTEREST_CAP = 5;
/** 存档结构版本。改 RunState 字段时必须 +1，并在 persist.ts 补迁移。 */
export const SAVE_VERSION = 2;

export function createRun(seed: string = randomSeed()): RunState {
  const deck = shuffle(createDeck(), makeRng(seed, 'deck'));
  return {
    version: SAVE_VERSION,
    seed,
    ante: 1,
    blindIndex: 0,
    money: 4,
    deck,
    discardPile: [],
    hand: [],
    jokers: [],
    handLevels: initialHandLevels(),
    bossId: null,
    bossRule: null,
    handSize: HAND_SIZE,
    handsLeft: HANDS_PER_ROUND,
    discardsLeft: DISCARDS_PER_ROUND,
    discardsUsed: 0,
    roundScore: 0,
    target: targetFor(1, 0),
    shuffleCount: 0,
    phase: 'blindSelect',
    shop: null,
    lastScore: null,
    selected: [],
  };
}

/** 抽牌；牌堆空则把弃牌堆洗回（确定性） */
function draw(
  state: RunState,
  count: number,
): Pick<RunState, 'deck' | 'discardPile' | 'hand' | 'shuffleCount'> {
  let deck = state.deck.slice();
  let discardPile = state.discardPile.slice();
  let shuffleCount = state.shuffleCount;
  const hand = state.hand.slice();

  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      if (discardPile.length === 0) break;
      shuffleCount += 1;
      deck = shuffle(discardPile, makeRng(state.seed, `reshuffle:${shuffleCount}`));
      discardPile = [];
    }
    const next = deck.shift();
    if (!next) break;
    hand.push(next);
  }

  return { deck, discardPile, hand: sortHand(hand), shuffleCount };
}

export type Action =
  | { type: 'newRun'; seed?: string }
  /** bossId 仅供测试/调试显式指定，正常流程由 seed 决定 */
  | { type: 'selectBlind'; bossId?: string }
  | { type: 'toggleCard'; cardId: string }
  | { type: 'playHand' }
  | { type: 'discard' }
  | { type: 'cashOut' }
  | { type: 'buyJoker'; index: number }
  | { type: 'reroll' }
  | { type: 'leaveShop' }
  | { type: 'loadState'; state: RunState };

export function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case 'newRun':
      return createRun(action.seed);

    case 'loadState':
      return action.state;

    case 'selectBlind': {
      if (state.phase !== 'blindSelect') return state;

      // Boss 位：解析规则并在这里一次性套用。**这是全部盲注规则的唯一入口**，
      // 不在 playHand / discard 里各写一份判断。
      let bossId: string | null = null;
      let bossRule: BlindRule | null = null;
      if (state.blindIndex >= 2) {
        const resolved = resolveBoss(state.seed, state.ante, action.bossId);
        bossId = resolved.boss.id;
        bossRule = resolved.rule;
      }

      const target = Math.round(
        targetFor(state.ante, state.blindIndex) * (bossRule?.targetMultiplier ?? 1),
      );
      const handSize = Math.max(1, HAND_SIZE + (bossRule?.handSizeDelta ?? 0));
      const discardsLeft = bossRule?.forbidDiscards ? 0 : DISCARDS_PER_ROUND;

      const recycled: Card[] = [...state.discardPile, ...state.hand];
      const fresh: RunState = {
        ...state,
        phase: 'playing',
        bossId,
        bossRule,
        handSize,
        target,
        handsLeft: HANDS_PER_ROUND,
        discardsLeft,
        discardsUsed: 0,
        roundScore: 0,
        discardPile: recycled,
        hand: [],
        selected: [],
        lastScore: null,
      };
      return { ...fresh, ...draw(fresh, handSize) };
    }

    case 'toggleCard': {
      if (state.phase !== 'playing') return state;
      const selected = state.selected.includes(action.cardId)
        ? state.selected.filter((id) => id !== action.cardId)
        : state.selected.length >= 5
          ? state.selected
          : [...state.selected, action.cardId];
      return { ...state, selected };
    }

    case 'playHand': {
      if (state.phase !== 'playing') return state;
      if (state.selected.length === 0 || state.selected.length > 5) return state;

      // 铁律：必须恰好出满 N 张，否则不响应（界面同步禁用按钮）
      const required = state.bossRule?.requirePlayedCards;
      if (required && state.selected.length !== required) return state;

      const played = state.hand.filter((c) => state.selected.includes(c.id));
      if (played.length === 0) return state;

      const result = scoreHand({
        played,
        jokers: state.jokers,
        handLevels: state.handLevels,
        money: state.money,
        handsLeft: state.handsLeft,
        discardsUsed: state.discardsUsed,
        ante: state.ante,
        rule: state.bossRule,
      });

      const remaining = state.hand.filter((c) => !state.selected.includes(c.id));
      const roundScore = state.roundScore + result.score;
      const handsLeft = state.handsLeft - 1;

      let phase: RunState['phase'] = 'playing';
      if (roundScore >= state.target) phase = 'cashOut';
      else if (handsLeft === 0) phase = 'lost';

      const next: RunState = {
        ...state,
        hand: remaining,
        discardPile: [...state.discardPile, ...played],
        roundScore,
        handsLeft,
        lastScore: result,
        selected: [],
        phase,
      };

      if (phase !== 'playing') return next;
      return { ...next, ...draw(next, next.handSize - next.hand.length) };
    }

    case 'discard': {
      if (state.phase !== 'playing') return state;
      if (state.discardsLeft <= 0) return state;
      if (state.selected.length === 0 || state.selected.length > 5) return state;

      const discarded = state.hand.filter((c) => state.selected.includes(c.id));
      const remaining = state.hand.filter((c) => !state.selected.includes(c.id));

      const next: RunState = {
        ...state,
        hand: remaining,
        discardPile: [...state.discardPile, ...discarded],
        discardsLeft: state.discardsLeft - 1,
        discardsUsed: state.discardsUsed + 1,
        selected: [],
      };
      return { ...next, ...draw(next, next.handSize - next.hand.length) };
    }

    case 'cashOut': {
      if (state.phase !== 'cashOut') return state;

      const interest = Math.min(Math.floor(state.money / 5), INTEREST_CAP);
      let money = state.money + rewardFor(state.blindIndex) + state.handsLeft + interest;

      for (const inst of state.jokers) {
        const def = getJoker(inst.defId);
        if (def?.onRoundEnd) money += def.onRoundEnd({ money, ante: state.ante });
      }

      // 打完最后一个底注的 Boss 才通关
      if (state.blindIndex >= 2 && state.ante >= MAX_ANTE) {
        return { ...state, money, phase: 'won' };
      }
      return { ...state, money, phase: 'shop', shop: rollShop(state.seed, state.ante * 10 + state.blindIndex) };
    }

    case 'buyJoker': {
      if (state.phase !== 'shop' || !state.shop) return state;
      const offer = state.shop.offers[action.index];
      if (!offer || offer.sold) return state;
      if (state.money < offer.cost) return state;
      if (state.jokers.length >= MAX_JOKERS) return state;

      const offers = state.shop.offers.map((o, i) => (i === action.index ? { ...o, sold: true } : o));
      return {
        ...state,
        money: state.money - offer.cost,
        jokers: [
          ...state.jokers,
          {
            uid: `${offer.defId}-a${state.ante}-b${state.blindIndex}-n${state.jokers.length}`,
            defId: offer.defId,
          },
        ],
        shop: { ...state.shop, offers },
      };
    }

    case 'reroll': {
      if (state.phase !== 'shop' || !state.shop) return state;
      if (state.money < state.shop.rerollCost) return state;

      const rerolls = state.shop.rerolls + 1;
      const shop = rollShop(state.seed, state.ante * 100 + state.blindIndex * 10 + rerolls);
      return {
        ...state,
        money: state.money - state.shop.rerollCost,
        shop: { ...shop, rerollCost: state.shop.rerollCost + 1, rerolls },
      };
    }

    case 'leaveShop': {
      if (state.phase !== 'shop') return state;
      // 打完 Boss 位则推进到下一底注，否则同底注的下一个盲注
      const bossCleared = state.blindIndex >= 2;
      const ante = bossCleared ? state.ante + 1 : state.ante;
      const blindIndex = bossCleared ? 0 : state.blindIndex + 1;
      return {
        ...state,
        ante,
        blindIndex,
        phase: 'blindSelect',
        shop: null,
        bossId: null,
        bossRule: null,
        handSize: HAND_SIZE,
        target: targetFor(ante, blindIndex),
        discardPile: [...state.discardPile, ...state.hand],
        hand: [],
        selected: [],
        roundScore: 0,
        lastScore: null,
      };
    }

    default:
      return state;
  }
}
