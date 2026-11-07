import { sortHand } from './cards';
import type { Card, Enhancement, RunState, Seal, Suit } from './types';

/**
 * 符咒：P2 的塔罗位。占消耗品槽，用掉即消失。
 *
 * 与原版的差别（刻意的简化）：目标牌从**整副牌**里选，而不是只在手牌里选。
 * 原因是本作的 shop 阶段手牌是空的（离开牌桌就收回牌堆），只允许手牌选目标的话，
 * 在商店里买到的符咒就成了废牌。整副牌可选在任何阶段都成立。
 */

export interface CharmCtx {
  state: RunState;
  /** 已经按 needsTarget 校验过数量的目标牌 */
  targets: Card[];
}

export interface CharmDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  kind: 'charm';
  /** 需要选几张牌；0 表示点了就用 */
  needsTarget: number;
  apply: (ctx: CharmCtx) => Partial<RunState> | null;
}

const CHARM_COST = 4;

/** 当前 run 里存在的全部牌：手牌 + 牌堆 + 弃牌堆（三处互不重叠） */
export function allRunCards(state: RunState): Card[] {
  return [...state.hand, ...state.deck, ...state.discardPile];
}

/**
 * 在三个牌堆里同时替换/删除目标牌。
 * fn 返回 null 表示删除这张牌（焚毁符）。
 */
function mapCards(
  state: RunState,
  targets: Card[],
  fn: (card: Card) => Card | null,
): Partial<RunState> {
  const ids = new Set(targets.map((t) => t.id));
  const apply = (arr: Card[]) =>
    arr.flatMap((c) => {
      if (!ids.has(c.id)) return [c];
      const next = fn(c);
      return next ? [next] : [];
    });

  // 改过点数后手牌要重新排序，保持「从左到右点数递增」的既有约定
  return { hand: sortHand(apply(state.hand)), deck: apply(state.deck), discardPile: apply(state.discardPile) };
}

function singleCharm(
  id: string,
  name: string,
  desc: string,
  fn: (card: Card) => Card,
): CharmDef {
  return {
    id,
    name,
    desc,
    cost: CHARM_COST,
    kind: 'charm',
    needsTarget: 1,
    apply: ({ state, targets }) => mapCards(state, targets, fn),
  };
}

const enhance = (e: Enhancement) => (card: Card) => ({ ...card, enhancement: e });

const SUIT_CHARM_NAME: Record<Suit, string> = {
  spade: '黑桃符',
  heart: '红心符',
  diamond: '方块符',
  club: '梅花符',
};

export const CHARMS: CharmDef[] = [
  // ── 6 张增强：各开一条独立加成通道 ──
  singleCharm('charm-bonus', '烈焰符', '选 1 张牌变为「附加」：计分 +30 筹码', enhance('bonus')),
  singleCharm('charm-mult', '洪流符', '选 1 张牌变为「倍率」：计分 +4 倍率', enhance('mult')),
  singleCharm(
    'charm-glass',
    '裂隙符',
    '选 1 张牌变为「裂隙」：本次计分 ×2 倍率，之后这张牌永久碎裂',
    enhance('glass'),
  ),
  singleCharm('charm-steel', '铸铁符', '选 1 张牌变为「铸铁」：留在手里不打出去时 ×1.5 倍率', enhance('steel')),
  singleCharm('charm-gold', '鎏金符', '选 1 张牌变为「鎏金」：回合结束若还留在手里，+$3', enhance('gold')),
  singleCharm('charm-wild', '幻形符', '选 1 张牌变为「幻形」：同花判定时视为任意花色', enhance('wild')),

  // ── 4 张变花色：为同花流铺路 ──
  singleCharm('charm-spade', SUIT_CHARM_NAME.spade, '把 1 张牌改成黑桃', (c) => ({ ...c, suit: 'spade' })),
  singleCharm('charm-heart', SUIT_CHARM_NAME.heart, '把 1 张牌改成红心', (c) => ({ ...c, suit: 'heart' })),
  singleCharm('charm-diamond', SUIT_CHARM_NAME.diamond, '把 1 张牌改成方块', (c) => ({ ...c, suit: 'diamond' })),
  singleCharm('charm-club', SUIT_CHARM_NAME.club, '把 1 张牌改成梅花', (c) => ({ ...c, suit: 'club' })),

  // ── 2 张改点数：为顺子流铺路 ──
  singleCharm('charm-rank-up', '升点符', '选 1 张牌点数 +1（A 回到 2）', (c) => ({
    ...c,
    rank: c.rank >= 14 ? 2 : c.rank + 1,
  })),
  singleCharm('charm-rank-down', '降点符', '选 1 张牌点数 −1（2 回到 A）', (c) => ({
    ...c,
    rank: c.rank <= 2 ? 14 : c.rank - 1,
  })),

  // ── 2 张蜡封 ──
  singleCharm('charm-seal-red', '朱砂符', '给 1 张牌加朱砂蜡封：计分时这张牌结算两次', (c) => ({
    ...c,
    seal: 'red' as Seal,
  })),
  singleCharm('charm-seal-gold', '金砂符', '给 1 张牌加金砂蜡封：这张牌每次计分 +$3', (c) => ({
    ...c,
    seal: 'gold' as Seal,
  })),

  // ── 2 张牌堆操作 ──
  {
    id: 'charm-destroy',
    name: '焚毁符',
    desc: '选 1 张牌永久移除。牌越薄，抽到好牌的概率越高',
    cost: CHARM_COST,
    kind: 'charm',
    needsTarget: 1,
    apply: ({ state, targets }) => mapCards(state, targets, () => null),
  },
  {
    id: 'charm-copy',
    name: '复制符',
    desc: '复制 1 张牌（连增强与蜡封一起复制）放进牌堆',
    cost: CHARM_COST,
    kind: 'charm',
    needsTarget: 1,
    apply: ({ state, targets }) => {
      const src = targets[0];
      if (!src) return null;
      const used = new Set(allRunCards(state).map((c) => c.id));
      let n = 1;
      let id = `${src.id}#copy${n}`;
      while (used.has(id)) {
        n += 1;
        id = `${src.id}#copy${n}`;
      }
      return { deck: [...state.deck, { ...src, id }] };
    },
  },

  // ── 2 张经济：不用选牌，买了就能换钱 ──
  {
    id: 'charm-tithe',
    name: '聚财符',
    desc: '立刻 +$8',
    cost: CHARM_COST,
    kind: 'charm',
    needsTarget: 0,
    apply: ({ state }) => ({ money: state.money + 8 }),
  },
  {
    id: 'charm-leverage',
    name: '杠杆符',
    desc: '资金翻倍，最多 +$20',
    cost: CHARM_COST,
    kind: 'charm',
    needsTarget: 0,
    apply: ({ state }) => ({ money: state.money + Math.min(state.money, 20) }),
  },
];

const BY_ID = new Map(CHARMS.map((c) => [c.id, c]));

export function getCharm(id: string): CharmDef | undefined {
  return BY_ID.get(id);
}
