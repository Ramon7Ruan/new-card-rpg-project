import { MAX_ANTE, resolveBoss, rewardFor, targetFor } from './blinds';
import { createDeck, sortHand } from './cards';
import { allRunCards } from './charms';
import { getConsumable, MAX_CONSUMABLES } from './consumables';

import { initialHandLevels } from './hands';
import { getJoker } from './jokers';
import { getPack, openPack, packSlot } from './packs';
import { makeRng, randomSeed, shuffle } from './rng';
import { scoreHand } from './scoring';
import { rollShop, sellValue, type ShopShelf } from './shop';
import { applyTag, rollTag } from './tags';
import { rollVoucher, VOUCHER_BASE, voucherEffects } from './vouchers';
import type { BlindRule, Card, RunState } from './types';

export const HAND_SIZE = 8;
export const HANDS_PER_ROUND = 4;
export const DISCARDS_PER_ROUND = 3;
/** 基础利息上限；「高息存款」优惠券会提高它 */
export const INTEREST_CAP = VOUCHER_BASE.interestCap;
/** 存档结构版本。改 RunState 字段时必须 +1，并在 persist.ts 补迁移。 */
export const SAVE_VERSION = 5;

/** 当前货架宽度。P3 起由优惠券加宽，所以必须每次从 state 算而不是读常量。 */
export function shelfOf(state: RunState): ShopShelf {
  const fx = voucherEffects(state.vouchers);
  return { jokers: fx.jokerShelf, consumables: fx.consumableShelf };
}

/** 生成在数组内唯一的 uid（卖出后再买入也不会撞车） */
function nextUid(prefix: string, used: { uid: string }[]): string {
  let n = 0;
  while (used.some((u) => u.uid === `${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

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
    consumables: [],
    vouchers: [],
    tags: [],
    freeRerolls: 0,
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
    pack: null,
    packSeq: 0,
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
  | { type: 'skipBlind' }
  | { type: 'toggleCard'; cardId: string }
  | { type: 'playHand' }
  | { type: 'discard' }
  | { type: 'cashOut' }
  | { type: 'buyJoker'; index: number }
  | { type: 'buyConsumable'; index: number }
  | { type: 'buyVoucher'; index: number }
  | { type: 'buyPack'; index: number }
  | { type: 'pickPack'; index: number }
  | { type: 'skipPack' }
  | { type: 'useConsumable'; index: number; targetIds?: string[] }
  | { type: 'sellJoker'; index: number }
  | { type: 'sellConsumable'; index: number }
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

    /**
     * 跳过盲注：不给盲注奖励、不打出任何牌，只换 1 个标签，然后停在下一次选择页。
     * Boss 位不能跳过（难度曲线靠它），这一点与 UI 的禁用保持一致。
     */
    case 'skipBlind': {
      if (state.phase !== 'blindSelect') return state;
      if (state.blindIndex >= 2) return state;

      const nonce = `${state.ante}:${state.blindIndex}`;
      const tag = rollTag(state.seed, nonce);
      const patch = applyTag(state, tag, nonce);
      const blindIndex = state.blindIndex + 1;

      return {
        ...state,
        ...patch,
        blindIndex,
        target: targetFor(state.ante, blindIndex),
        bossId: null,
        bossRule: null,
        tags: [...state.tags, tag.id],
        selected: [],
        lastScore: null,
      };
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

      const held = state.hand.filter((c) => !state.selected.includes(c.id));

      const result = scoreHand({
        played,
        held,
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

      // 裂隙：被计分的裂隙牌在本次出牌后永久碎裂（确定性规则，不掷骰）。
      // 碎裂的牌不进弃牌堆——它就是没了，牌堆会真的变薄。
      const shattered = new Set(
        played
          .filter((c) => c.enhancement === 'glass' && result.scoringCardIds.includes(c.id))
          .map((c) => c.id),
      );
      const survivors = played.filter((c) => !shattered.has(c.id));

      let phase: RunState['phase'] = 'playing';
      if (roundScore >= state.target) phase = 'cashOut';
      else if (handsLeft === 0) phase = 'lost';

      const next: RunState = {
        ...state,
        money: state.money + result.money,
        hand: remaining,
        discardPile: [...state.discardPile, ...survivors],
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

      const fx = voucherEffects(state.vouchers);
      const interest = Math.min(Math.floor(state.money / 5), fx.interestCap);
      // 鎏金：回合结束时还留在手里的牌，每张 +$3
      const goldBonus = state.hand.filter((c) => c.enhancement === 'gold').length * 3;
      let money =
        state.money + rewardFor(state.blindIndex) + state.handsLeft + interest + goldBonus;

      for (const inst of state.jokers) {
        const def = getJoker(inst.defId);
        if (def?.onRoundEnd) money += def.onRoundEnd({ money, ante: state.ante });
      }

      // 打完最后一个底注的 Boss 才通关
      if (state.blindIndex >= 2 && state.ante >= MAX_ANTE) {
        return { ...state, money, phase: 'won' };
      }

      const nonce = state.ante * 10 + state.blindIndex;
      const shelf = rollShop(state.seed, nonce, shelfOf(state));
      return {
        ...state,
        money,
        phase: 'shop',
        shop: {
          ...shelf,
          // 基础重摇价由优惠券决定（「常客折扣」）
          rerollCost: fx.rerollBase,
          voucher: rollVoucher(state.seed, nonce, state.ante, state.vouchers),
        },
      };
    }

    case 'buyJoker': {
      if (state.phase !== 'shop' || !state.shop) return state;
      if (state.pack) return state;
      const offer = state.shop.jokers[action.index];
      if (!offer || offer.sold) return state;
      if (state.money < offer.cost) return state;
      if (state.jokers.length >= voucherEffects(state.vouchers).jokerSlots) return state;

      const jokers = state.shop.jokers.map((o, i) => (i === action.index ? { ...o, sold: true } : o));
      return {
        ...state,
        money: state.money - offer.cost,
        jokers: [...state.jokers, { uid: nextUid(offer.defId, state.jokers), defId: offer.defId }],
        shop: { ...state.shop, jokers },
      };
    }

    case 'buyConsumable': {
      if (state.phase !== 'shop' || !state.shop) return state;
      if (state.pack) return state;
      const offer = state.shop.consumables[action.index];
      if (!offer || offer.sold) return state;
      if (state.money < offer.cost) return state;
      if (state.consumables.length >= voucherEffects(state.vouchers).consumableSlots) return state;

      const consumables = state.shop.consumables.map((o, i) =>
        i === action.index ? { ...o, sold: true } : o,
      );
      return {
        ...state,
        money: state.money - offer.cost,
        consumables: [
          ...state.consumables,
          { uid: nextUid(offer.defId, state.consumables), defId: offer.defId },
        ],
        shop: { ...state.shop, consumables },
      };
    }

    /**
     * 买优惠券：永久生效、同一张只能买一次。
     * 效果本身不在这个 case 里直接改字段——统一由 voucherEffects(state.vouchers) 计算，
     * 所以「买了之后槽位立刻变宽」和「刷新页面后仍然变宽」走的是同一条路径。
     */
    case 'buyVoucher': {
      if (state.phase !== 'shop' || !state.shop) return state;
      if (state.pack) return state;
      const offer = state.shop.voucher;
      if (!offer || offer.sold) return state;
      if (action.index !== 0) return state;
      if (state.money < offer.cost) return state;
      if (state.vouchers.includes(offer.defId)) return state;

      return {
        ...state,
        money: state.money - offer.cost,
        vouchers: [...state.vouchers, offer.defId],
        shop: { ...state.shop, voucher: { ...offer, sold: true } },
      };
    }

    /**
     * 买补充包。槽位不够时**直接买不了**（UI 会禁用并写「槽位已满」），
     * 而不是先扣钱、开包时才发现装不下——那样只能把玩家选的牌丢掉。
     */
    case 'buyPack': {
      if (state.phase !== 'shop' || !state.shop) return state;
      if (state.pack) return state;
      const offer = state.shop.packs[action.index];
      if (!offer || offer.sold) return state;
      const def = getPack(offer.defId);
      if (!def) return state;
      if (state.money < offer.cost) return state;

      const fx = voucherEffects(state.vouchers);
      const slot = packSlot(def.id);
      if (slot === 'joker' && state.jokers.length >= fx.jokerSlots) return state;
      if (slot === 'consumable' && state.consumables.length >= fx.consumableSlots) return state;

      // 开包内容的种子要能区分「同一间商店里的第几个包」和「重摇前/后」
      const nonce = `${state.ante}:${state.blindIndex}:${state.shop.rerolls}:${action.index}`;
      const packs = state.shop.packs.map((o, i) => (i === action.index ? { ...o, sold: true } : o));

      return {
        ...state,
        money: state.money - offer.cost,
        pack: openPack(state.seed, nonce, def, state.packSeq),
        packSeq: state.packSeq + 1,
        shop: { ...state.shop, packs },
      };
    }

    /** 从开出来的 3 张里选 1 张；选完包即关闭 */
    case 'pickPack': {
      const pack = state.pack;
      if (!pack) return state;
      const choice = pack.choices[action.index];
      if (!choice) return state;

      if (choice.kind === 'joker') {
        if (state.jokers.length >= voucherEffects(state.vouchers).jokerSlots) return state;
        return {
          ...state,
          pack: null,
          jokers: [
            ...state.jokers,
            { uid: nextUid(choice.defId, state.jokers), defId: choice.defId },
          ],
        };
      }

      if (choice.kind === 'consumable') {
        if (state.consumables.length >= voucherEffects(state.vouchers).consumableSlots) {
          return state;
        }
        return {
          ...state,
          pack: null,
          consumables: [
            ...state.consumables,
            { uid: nextUid(choice.defId, state.consumables), defId: choice.defId },
          ],
        };
      }

      // 标准包：牌直接进牌堆（id 已带 #pack 后缀，不会和原有牌撞）
      return { ...state, pack: null, deck: [...state.deck, choice.card] };
    }

    /** 整包跳过：不选任何一张，包作废 */
    case 'skipPack': {
      if (!state.pack) return state;
      return { ...state, pack: null };
    }

    /**
     * 使用消耗品。
     * - 铭文：把目标牌型升 1 级（不需要选牌）
     * - 符咒：按 needsTarget 校验目标牌数量后再应用效果
     * 允许在牌桌与商店使用（买完立刻用是正常操作），盲注选择页不可用。
     */
    case 'useConsumable': {
      if (state.phase !== 'playing' && state.phase !== 'shop') return state;
      const inst = state.consumables[action.index];
      if (!inst) return state;
      const def = getConsumable(inst.defId);
      if (!def) return state;

      const without = state.consumables.filter((_, i) => i !== action.index);

      if (def.kind === 'planet') {
        if (!def.target) return state;
        const type = def.target;
        return {
          ...state,
          handLevels: { ...state.handLevels, [type]: (state.handLevels[type] ?? 1) + 1 },
          consumables: without,
        };
      }

      const need = def.needsTarget ?? 0;
      const ids = action.targetIds ?? [];
      // 数量必须刚好，且不能同一张牌选两次
      if (ids.length !== need) return state;
      if (new Set(ids).size !== ids.length) return state;

      const pool = new Map(allRunCards(state).map((c) => [c.id, c]));
      const targets: Card[] = [];
      for (const id of ids) {
        const found = pool.get(id);
        if (!found) return state;
        targets.push(found);
      }

      const patch = def.apply?.({ state, targets });
      if (!patch) return state;
      return { ...state, ...patch, consumables: without };
    }

    /** 卖出小丑：只在商店页。价格 = 原价 × SELL_RATE（见 shop.ts） */
    case 'sellJoker': {
      if (state.phase !== 'shop') return state;
      const inst = state.jokers[action.index];
      if (!inst) return state;
      const def = getJoker(inst.defId);
      if (!def) return state;

      return {
        ...state,
        money: state.money + sellValue(def.cost),
        jokers: state.jokers.filter((_, i) => i !== action.index),
      };
    }

    case 'sellConsumable': {
      if (state.phase !== 'shop') return state;
      const inst = state.consumables[action.index];
      if (!inst) return state;
      const def = getConsumable(inst.defId);
      if (!def) return state;

      return {
        ...state,
        money: state.money + sellValue(def.cost),
        consumables: state.consumables.filter((_, i) => i !== action.index),
      };
    }

    case 'reroll': {
      if (state.phase !== 'shop' || !state.shop) return state;
      // 包没处理完就不能重摇：重摇会换掉货架，开着的包会变成孤儿
      if (state.pack) return state;

      // 「会员卡」标签：这一次重摇免费，先扣次数再谈钱
      const free = state.freeRerolls > 0;
      if (!free && state.money < state.shop.rerollCost) return state;

      const rerolls = state.shop.rerolls + 1;
      const shop = rollShop(
        state.seed,
        state.ante * 100 + state.blindIndex * 10 + rerolls,
        shelfOf(state),
      );
      return {
        ...state,
        money: free ? state.money : state.money - state.shop.rerollCost,
        freeRerolls: free ? state.freeRerolls - 1 : state.freeRerolls,
        // 重摇后券也要重新挂（已经买过的不会重复出现）
        shop: {
          ...shop,
          rerollCost: state.shop.rerollCost + 1,
          rerolls,
          voucher: rollVoucher(
            state.seed,
            state.ante * 100 + state.blindIndex * 10 + rerolls,
            state.ante,
            state.vouchers,
          ),
        },
      };
    }

    case 'leaveShop': {
      if (state.phase !== 'shop') return state;
      if (state.pack) return state;
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
