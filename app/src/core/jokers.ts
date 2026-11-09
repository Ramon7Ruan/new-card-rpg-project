import type { Card, HandType } from './types';

export interface JokerCtx {
  /** 本次打出的全部牌（含被 Boss 压制的） */
  played: Card[];
  /** 真正计分的牌（已剔除被压制的）——按花色/点数做条件时用这个 */
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
  /** 计分时直接给的钱（P4）。与金砂蜡封同一条通道，进 ScoreResult.money */
  money: number;
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
  onRoundEnd?: (ctx: { money: number; ante: number; handsLeft: number }) => number;
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
 * 50 张小丑，覆盖 6 类机制。
 * 名字与文案均为自拟，未沿用原版措辞。
 *
 * 定价（2026-11-09 调整）：整体下调 $1、最低 $2，稀有度之间的相对价差保持不变。
 * 目的不是平衡，而是测试期能多买几张看看组合效果。
 */
export const JOKERS: JokerDef[] = [
  // ── 静态筹码 ──
  {
    id: 'bronze',
    name: '铜块',
    desc: '+50 筹码',
    cost: 3,
    rarity: 'common',
    onScored: (_ctx, m) => {
      m.chips += 50;
    },
  },
  {
    id: 'stone',
    name: '石块',
    desc: '+30 筹码',
    cost: 2,
    rarity: 'common',
    onScored: (_ctx, m) => {
      m.chips += 30;
    },
  },
  {
    id: 'block',
    name: '积木',
    desc: '每张打出的牌 +8 筹码',
    cost: 3,
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
    cost: 2,
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
    cost: 4,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      if (ctx.played.length === 1) m.mult += 20;
    },
  },
  {
    id: 'pairfan',
    name: '对子迷',
    desc: '打出含对子的牌型时 +8 倍率',
    cost: 3,
    rarity: 'common',
    onScored: (ctx, m) => {
      if (CONTAINS_PAIR.includes(ctx.handType)) m.mult += 8;
    },
  },
  {
    id: 'flushfaith',
    name: '同花信',
    desc: '打出同花时 +15 倍率',
    cost: 4,
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
    cost: 7,
    rarity: 'rare',
    onScored: (_ctx, m) => {
      m.xMult *= 3;
    },
  },
  {
    id: 'fission',
    name: '裂变',
    desc: '×2 倍率',
    cost: 5,
    rarity: 'uncommon',
    onScored: (_ctx, m) => {
      m.xMult *= 2;
    },
  },
  {
    id: 'extremist',
    name: '极端',
    desc: '恰好打出 5 张牌时 ×2 倍率',
    cost: 6,
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
    cost: 4,
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
    cost: 4,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      m.mult += 3 * ctx.played.filter((c) => c.rank >= 11 && c.rank <= 13).length;
    },
  },
  {
    id: 'spadelaw',
    name: '黑桃法',
    desc: '每张打出的黑桃 +15 筹码',
    cost: 3,
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
    cost: 4,
    rarity: 'common',
    onRoundEnd: () => 2,
  },
  {
    id: 'discarder',
    name: '弃牌客',
    desc: '本回合每弃 1 次 +4 倍率',
    cost: 4,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      m.mult += 4 * ctx.discardsUsed;
    },
  },
  {
    id: 'emptyhand',
    name: '空手',
    desc: '本回合每剩 1 次出牌 +5 倍率',
    cost: 5,
    rarity: 'rare',
    onScored: (ctx, m) => {
      m.mult += 5 * ctx.handsLeft;
    },
  },
  {
    id: 'interestnote',
    name: '利息票据',
    desc: '回合结束若持有 ≥ $20，+$3',
    cost: 3,
    rarity: 'uncommon',
    onRoundEnd: (ctx) => (ctx.money >= 20 ? 3 : 0),
  },

  // ══════════════════════════════════════════════════════════
  // P4 新增 32 张：四类各 8 张，全部带条件（不做纯常数）
  // 统计口径见 test/jokerPool.test.ts：用两套截然不同的 ctx 跑同一张牌，
  // 若结果完全一致就算「纯常数」，总数必须 ≤ 10。
  // ══════════════════════════════════════════════════════════

  // ── 花色流 8 ──
  {
    id: 'heart-tithe',
    name: '红心税',
    desc: '每张计分的红心 +4 倍率',
    cost: 4,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      m.mult += 4 * ctx.scoring.filter((c) => c.suit === 'heart').length;
    },
  },
  {
    id: 'club-chain',
    name: '梅花链',
    desc: '计分牌里有 3 张以上梅花时 +60 筹码',
    cost: 3,
    rarity: 'common',
    onScored: (ctx, m) => {
      if (ctx.scoring.filter((c) => c.suit === 'club').length >= 3) m.chips += 60;
    },
  },
  {
    id: 'diamond-edge',
    name: '方块刃',
    desc: '每张计分的方块 +25 筹码',
    cost: 3,
    rarity: 'common',
    onScored: (ctx, m) => {
      m.chips += 25 * ctx.scoring.filter((c) => c.suit === 'diamond').length;
    },
  },
  {
    id: 'spade-crown',
    name: '黑桃冠',
    desc: '计分牌里有黑桃 K 时 ×1.5 倍率',
    cost: 6,
    rarity: 'rare',
    onScored: (ctx, m) => {
      if (ctx.scoring.some((c) => c.suit === 'spade' && c.rank === 13)) m.xMult *= 1.5;
    },
  },
  {
    id: 'suit-sweep',
    name: '四色齐',
    desc: '四种花色都出现时 +$3',
    cost: 5,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      if (new Set(ctx.scoring.map((c) => c.suit)).size === 4) m.money += 3;
    },
  },
  {
    id: 'mono-five',
    name: '单色五',
    desc: '恰好 5 张且同花色时 ×2 倍率',
    cost: 7,
    rarity: 'rare',
    onScored: (ctx, m) => {
      if (ctx.scoring.length === 5 && new Set(ctx.scoring.map((c) => c.suit)).size === 1) {
        m.xMult *= 2;
      }
    },
  },
  {
    id: 'wild-love',
    name: '幻形恋',
    desc: '每张计分的幻形牌 +10 倍率',
    cost: 5,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      m.mult += 10 * ctx.scoring.filter((c) => c.enhancement === 'wild').length;
    },
  },
  {
    id: 'red-swell',
    name: '红潮',
    desc: '红桃与方块合计 3 张以上时 +45 筹码',
    cost: 3,
    rarity: 'common',
    onScored: (ctx, m) => {
      const red = ctx.scoring.filter((c) => c.suit === 'heart' || c.suit === 'diamond').length;
      if (red >= 3) m.chips += 45;
    },
  },

  // ── 点数与人头 8 ──
  {
    id: 'even-stack',
    name: '偶数堆',
    desc: '每张计分的偶数点 +8 筹码',
    cost: 3,
    rarity: 'common',
    onScored: (ctx, m) => {
      m.chips += 8 * ctx.scoring.filter((c) => c.rank % 2 === 0).length;
    },
  },
  {
    id: 'odd-stack',
    name: '奇数堆',
    desc: '每张计分的奇数点 +4 倍率（A 算 1）',
    cost: 4,
    rarity: 'common',
    onScored: (ctx, m) => {
      m.mult += 4 * ctx.scoring.filter((c) => c.rank % 2 === 1).length;
    },
  },
  {
    id: 'high-ranks',
    name: '大牌压',
    desc: '每张计分的 10 / J / Q / K / A +12 筹码',
    cost: 3,
    rarity: 'common',
    onScored: (ctx, m) => {
      m.chips += 12 * ctx.scoring.filter((c) => c.rank >= 10).length;
    },
  },
  {
    id: 'low-ranks',
    name: '小牌撬',
    desc: '每张计分的 2–5 点 +5 倍率',
    cost: 4,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      m.mult += 5 * ctx.scoring.filter((c) => c.rank <= 5).length;
    },
  },
  {
    id: 'court-bounty',
    name: '人头赏',
    desc: '每张计分的 J / Q / K +$1',
    cost: 5,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      m.money += ctx.scoring.filter((c) => c.rank >= 11 && c.rank <= 13).length;
    },
  },
  {
    id: 'king-tower',
    name: '王塔',
    desc: '每张计分的 K ×1.5 倍率',
    cost: 6,
    rarity: 'rare',
    onScored: (ctx, m) => {
      const kings = ctx.scoring.filter((c) => c.rank === 13).length;
      for (let i = 0; i < kings; i++) m.xMult *= 1.5;
    },
  },
  {
    id: 'queen-garden',
    name: '后园',
    desc: '每张计分的 Q +6 倍率',
    cost: 4,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      m.mult += 6 * ctx.scoring.filter((c) => c.rank === 12).length;
    },
  },
  {
    id: 'ace-anchor',
    name: '王牌锚',
    desc: '每张计分的 A +25 筹码、+2 倍率',
    cost: 5,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      const aces = ctx.scoring.filter((c) => c.rank === 14).length;
      m.chips += 25 * aces;
      m.mult += 2 * aces;
    },
  },

  // ── 经济流 8 ──
  {
    id: 'spade-bounty',
    name: '黑桃赏',
    desc: '每张计分的黑桃 +$1',
    cost: 3,
    rarity: 'common',
    onScored: (ctx, m) => {
      m.money += ctx.scoring.filter((c) => c.suit === 'spade').length;
    },
  },
  {
    id: 'gild-keeper',
    name: '镀金匠',
    desc: '计分牌里有金砂蜡封时 +$3',
    cost: 5,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      if (ctx.scoring.some((c) => c.seal === 'gold')) m.money += 3;
    },
  },
  {
    id: 'pauper',
    name: '穷汉',
    desc: '资金 ≤ $5 时 +18 倍率',
    cost: 4,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      if (ctx.money <= 5) m.mult += 18;
    },
  },
  {
    id: 'rich-tax',
    name: '富税',
    desc: '资金 ≥ $25 时 ×2 倍率',
    cost: 7,
    rarity: 'rare',
    onScored: (ctx, m) => {
      if (ctx.money >= 25) m.xMult *= 2;
    },
  },
  {
    id: 'frugal-purse',
    name: '铁钱包',
    desc: '本回合还没弃过牌时 +$2',
    cost: 3,
    rarity: 'common',
    onScored: (ctx, m) => {
      if (ctx.discardsUsed === 0) m.money += 2;
    },
  },
  {
    id: 'scavenger',
    name: '拾荒',
    desc: '回合结束每剩 1 次出牌 +$1',
    cost: 5,
    rarity: 'uncommon',
    onRoundEnd: (ctx) => ctx.handsLeft,
  },
  {
    id: 'miser',
    name: '守财',
    desc: '回合结束若资金 ≥ $10，+$2',
    cost: 3,
    rarity: 'common',
    onRoundEnd: (ctx) => (ctx.money >= 10 ? 2 : 0),
  },
  {
    id: 'ante-stipend',
    name: '底注津贴',
    desc: '回合结束 +$1；底注 ≥ 3 时改为 +$3',
    cost: 4,
    rarity: 'common',
    onRoundEnd: (ctx) => (ctx.ante >= 3 ? 3 : 1),
  },

  // ── 节奏流 8（弃牌与剩余出牌） ──
  {
    id: 'dump-truck',
    name: '弃牌车',
    desc: '本回合已弃 2 次以上时 +40 筹码',
    cost: 4,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      if (ctx.discardsUsed >= 2) m.chips += 40;
    },
  },
  {
    id: 'last-hand',
    name: '背水',
    desc: '只剩 1 次出牌时 ×2 倍率',
    cost: 7,
    rarity: 'rare',
    onScored: (ctx, m) => {
      if (ctx.handsLeft <= 1) m.xMult *= 2;
    },
  },
  {
    id: 'opening',
    name: '先手',
    desc: '本回合一次牌都没出过（剩 4 次）时 +10 倍率',
    cost: 3,
    rarity: 'common',
    onScored: (ctx, m) => {
      if (ctx.handsLeft >= 4) m.mult += 10;
    },
  },
  {
    id: 'frugal',
    name: '不弃',
    desc: '本回合没弃过牌时 ×1.5 倍率',
    cost: 6,
    rarity: 'rare',
    onScored: (ctx, m) => {
      if (ctx.discardsUsed === 0) m.xMult *= 1.5;
    },
  },
  {
    id: 'dump-chips',
    name: '弃换筹',
    desc: '本回合每弃 1 次 +20 筹码',
    cost: 3,
    rarity: 'common',
    onScored: (ctx, m) => {
      m.chips += 20 * ctx.discardsUsed;
    },
  },
  {
    id: 'triple',
    name: '三张流',
    desc: '恰好打出 3 张时 +12 倍率',
    cost: 3,
    rarity: 'common',
    onScored: (ctx, m) => {
      if (ctx.played.length === 3) m.mult += 12;
    },
  },
  {
    id: 'duo',
    name: '两张牌',
    desc: '恰好打出 2 张时 +8 倍率',
    cost: 2,
    rarity: 'common',
    onScored: (ctx, m) => {
      if (ctx.played.length === 2) m.mult += 8;
    },
  },
  {
    id: 'quad',
    name: '四张牌',
    desc: '恰好打出 4 张时 ×1.5 倍率',
    cost: 4,
    rarity: 'uncommon',
    onScored: (ctx, m) => {
      if (ctx.played.length === 4) m.xMult *= 1.5;
    },
  },
];

const BY_ID = new Map(JOKERS.map((j) => [j.id, j]));

export function getJoker(id: string): JokerDef | undefined {
  return BY_ID.get(id);
}

export const MAX_JOKERS = 5;
