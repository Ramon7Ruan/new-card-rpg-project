import { allRunCards } from './charms';
import { ALL_HAND_TYPES } from './hands';
import { makeRng, type Rng } from './rng';
import type { Card, RunState } from './types';

/**
 * 标签（P3）：跳过盲注的补偿。
 *
 * 规则边界（刻意的）：
 * - 跳过**不给**盲注奖励、不给利息、不打出牌——只换 1 个标签。
 * - Boss 盲注不能跳过，否则整局的难度曲线会被跳过键抹平。
 * - 除「免费重摇」外，其余标签都在跳过的瞬间结算，不引入新的待生效状态。
 */

export interface TagDef {
  id: string;
  name: string;
  desc: string;
}

export const TAGS: TagDef[] = [
  { id: 'tag-cash', name: '现钱袋', desc: '立刻 +$6' },
  { id: 'tag-level', name: '手记残页', desc: '随机一个牌型 +1 级（永久）' },
  { id: 'tag-reroll', name: '会员卡', desc: '下一次商店重摇免费一次' },
  { id: 'tag-enhance', name: '火漆印', desc: '牌堆里随机一张牌变成「附加」（+30 筹码）' },
];

const BY_ID = new Map(TAGS.map((t) => [t.id, t]));

export function getTag(id: string): TagDef | undefined {
  return BY_ID.get(id);
}

/** 跳过时抽到的标签：确定性（同一 seed/底注/盲注结果一致） */
export function rollTag(seed: string, nonce: string): TagDef {
  const rnd = makeRng(seed, `tag:${nonce}`);
  return TAGS[Math.floor(rnd() * TAGS.length)];
}

function moneyTag(state: RunState, amount: number): Partial<RunState> {
  return { money: state.money + amount };
}

/** 随机一张没有增强的牌加「附加」；全都强化过了就折成 $4 */
function enhanceRandomCard(state: RunState, rnd: Rng): Partial<RunState> {
  const pool = allRunCards(state).filter((c) => !c.enhancement);
  if (pool.length === 0) return moneyTag(state, 4);

  const target = pool[Math.floor(rnd() * pool.length)];
  const patch = (arr: Card[]): Card[] =>
    arr.map((c) => (c.id === target.id ? { ...c, enhancement: 'bonus' as const } : c));

  return {
    deck: patch(state.deck),
    hand: patch(state.hand),
    discardPile: patch(state.discardPile),
  };
}

/** 标签的效果。返回要写回 RunState 的字段（tags 本身由 reducer 追加）。 */
export function applyTag(state: RunState, tag: TagDef, nonce: string): Partial<RunState> {
  const rnd = makeRng(state.seed, `tag-effect:${nonce}:${tag.id}`);

  switch (tag.id) {
    case 'tag-cash':
      return moneyTag(state, 6);
    case 'tag-reroll':
      return { freeRerolls: state.freeRerolls + 1 };
    case 'tag-level': {
      const type = ALL_HAND_TYPES[Math.floor(rnd() * ALL_HAND_TYPES.length)];
      return {
        handLevels: { ...state.handLevels, [type]: (state.handLevels[type] ?? 1) + 1 },
      };
    }
    case 'tag-enhance':
      return enhanceRandomCard(state, rnd);
    default:
      return {};
  }
}
