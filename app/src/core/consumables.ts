import { CHARMS, type CharmCtx } from './charms';
import { ALL_HAND_TYPES, HAND_LABEL, HAND_LEVEL_GAIN } from './hands';
import type { HandType, RunState } from './types';

/** 消耗品槽位上限 */
export const MAX_CONSUMABLES = 2;
/** 铭文统一售价。12 种价值相近，用差价只会诱导「只买某一种」。 */
export const CONSUMABLE_COST = 3;

export type ConsumableKind = 'planet' | 'charm';

export interface ConsumableDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  kind: ConsumableKind;
  /** 铭文：使用后升级哪个牌型 */
  target?: HandType;
  /** 符咒：需要选几张牌，0 = 直接使用 */
  needsTarget?: number;
  /** 符咒的实际效果，返回要写回 RunState 的字段 */
  apply?: (ctx: CharmCtx) => Partial<RunState> | null;
}

/**
 * 铭文（原版星球位）：使用后把它对应的牌型永久升 1 级，用后从槽位消失。
 * 命名与文案均为自拟，未沿用原作星球牌的名称。
 */
function inscription(target: HandType): ConsumableDef {
  const gain = HAND_LEVEL_GAIN[target];
  return {
    id: `inscribe-${target}`,
    name: `${HAND_LABEL[target]}铭文`,
    desc: `${HAND_LABEL[target]} +${gain.chips} 筹码、+${gain.mult} 倍率（永久）`,
    cost: CONSUMABLE_COST,
    kind: 'planet',
    target,
  };
}

/** 12 张铭文，按牌型从常见到稀有排列，商店列表顺序稳定 */
export const PLANETS: ConsumableDef[] = ALL_HAND_TYPES.map(inscription);

/** 消耗品总表：铭文 + 符咒。商店从这张表里抽，槽位与卖出逻辑不区分种类。 */
export const CONSUMABLES: ConsumableDef[] = [...PLANETS, ...CHARMS];

const BY_ID = new Map(CONSUMABLES.map((c) => [c.id, c]));

export function getConsumable(id: string): ConsumableDef | undefined {
  return BY_ID.get(id);
}
