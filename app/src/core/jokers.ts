import type { Card, HandType } from './types';

export interface JokerCtx {
  played: Card[];
  scoring: Card[];
  handType: HandType;
  money: number;
  handsLeft: number;
  discardsUsed: number;
  ante: number;
}

export interface JokerMods {
  chips: number;
  mult: number;
  /** 乘算倍率，初始 1 */
  xMult: number;
}

export interface JokerDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  rarity: 'common' | 'uncommon' | 'rare';
  /** 计分时按槽位顺序触发 */
  onScored?: (ctx: JokerCtx, mods: JokerMods) => void;
  /** 回合结算时改变金钱，返回增量 */
  onRoundEnd?: (ctx: { money: number; ante: number }) => number;
}

const CONTAINS_PAIR: HandType[] = [
  'pair',
  'twoPair',
  'threeOfAKind',
  'fullHouse',
  'fourOfAKind',
  'fiveOfAKind',
  'flushHouse',
  'flushFive',
];

const IS_FLUSH: HandType[] = ['flush', 'straightFlush', 'flushHouse', 'flushFive'];
const IS_STRAIGHT: HandType[] = ['straight', 'straightFlush'];

/**
 * 18 张小丑，覆盖 6 类机制。
 * 名字与文案均为自拟，未沿用原版措辞。
 */
export const JOKERS: JokerDef[] = [
  // ── 静态筹码 ──
  {
    id: 'bronze',
    name: '铜块',
    desc: '+50 筹码',
    cost: 4,
    rarity: 'common',
    onScored: (_ctx, m) => {
      m.chips += 50;
    },
  },
  {
    id: 'stone',
    name: '石块',
    desc: '+30 筹码',
    cost: 3,
    rarity: 'common',
    onScored: (_ctx, m) => {
      m.chips += 30;
    },
  },
  {
    id: 'block',
    name: '积木',
    desc: '每张打出的牌 +8 筹码',
    cost: 4,
    rarity: 'common',
    onScored: (ctx, m) => {
      m.chips += 8 * ctx.played.length;
    },
  },

  // ── 静态倍率 ──
  {
    id: 'jester',
    name: '小丑',
    desc: '+4 倍率',
    cost: 2,
    rarity: 'common',
    onScored: (_ctx, m) => {
      m.mult += 4;
    },
  },
  {
    id: 'twin',
    name: '双子',
    desc: '+6 倍率',
    cost: 3,
    rarity: 'common',
    onScored: (_ctx, m) => {
      m.mult += 6;
    },
  },

  // ── 条件倍率 ──
  {
    id: 'solo',
    name: '独行',
    desc: '只打出 1 张牌时 +20 倍率',
    cost: 5,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      if (ctx.played.length === 1) m.mult += 20;
    },
  },
  {
    id: 'pairfan',
    name: '对子迷',
    desc: '打出含对子的牌型时 +8 倍率',
    cost: 4,
    rarity: 'common',
    onScored: (ctx, m) => {
      if (CONTAINS_PAIR.includes(ctx.handType)) m.mult += 8;
    },
  },
  {
    id: 'flushfaith',
    name: '同花信',
    desc: '打出同花时 +15 倍率',
    cost: 5,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      if (IS_FLUSH.includes(ctx.handType)) m.mult += 15;
    },
  },

  // ── ×倍率 ──
  {
    id: 'prism',
    name: '棱镜',
    desc: '×3 倍率',
    cost: 8,
    rarity: 'rare',
    onScored: (_ctx, m) => {
      m.xMult *= 3;
    },
  },
  {
    id: 'fission',
    name: '裂变',
    desc: '×2 倍率',
    cost: 6,
    rarity: 'uncommon',
    onScored: (_ctx, m) => {
      m.xMult *= 2;
    },
  },
  {
    id: 'extremist',
    name: '极端',
    desc: '恰好打出 5 张牌时 ×2 倍率',
    cost: 7,
    rarity: 'rare',
    onScored: (ctx, m) => {
      if (ctx.played.length === 5) m.xMult *= 2;
    },
  },

  // ── 依牌型 / 依牌 ──
  {
    id: 'smith',
    name: '顺子匠',
    desc: '打出顺子时 +30 筹码 +10 倍率',
    cost: 5,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      if (IS_STRAIGHT.includes(ctx.handType)) {
        m.chips += 30;
        m.mult += 10;
      }
    },
  },
  {
    id: 'faceup',
    name: '面朝上',
    desc: '每张打出的 J/Q/K +3 倍率',
    cost: 5,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      m.mult += 3 * ctx.played.filter((c) => c.rank >= 11 && c.rank <= 13).length;
    },
  },
  {
    id: 'spadelaw',
    name: '黑桃法',
    desc: '每张打出的黑桃 +15 筹码',
    cost: 4,
    rarity: 'common',
    onScored: (ctx, m) => {
      m.chips += 15 * ctx.played.filter((c) => c.suit === 'spade').length;
    },
  },

  // ── 成长 / 经济 ──
  {
    id: 'piggy',
    name: '存钱罐',
    desc: '回合结束 +$2',
    cost: 5,
    rarity: 'common',
    onRoundEnd: () => 2,
  },
  {
    id: 'discarder',
    name: '弃牌客',
    desc: '本回合每弃 1 次 +4 倍率',
    cost: 5,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      m.mult += 4 * ctx.discardsUsed;
    },
  },
  {
    id: 'emptyhand',
    name: '空手',
    desc: '本回合每剩 1 次出牌 +5 倍率',
    cost: 6,
    rarity: 'rare',
    onScored: (ctx, m) => {
      m.mult += 5 * ctx.handsLeft;
    },
  },
  {
    id: 'interestnote',
    name: '利息票据',
    desc: '回合结束若持有 ≥ $20，+$3',
    cost: 4,
    rarity: 'uncommon',
    onRoundEnd: (ctx) => (ctx.money >= 20 ? 3 : 0),
  },
];

const BY_ID = new Map(JOKERS.map((j) => [j.id, j]));

export function getJoker(id: string): JokerDef | undefined {
  return BY_ID.get(id);
}

export const MAX_JOKERS = 5;
