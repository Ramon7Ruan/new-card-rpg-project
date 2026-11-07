import type { Card, Enhancement, Rank, Seal, Suit } from './types';

export const SUITS: Suit[] = ['spade', 'heart', 'diamond', 'club'];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const SUIT_SYMBOL: Record<Suit, string> = {
  spade: '♠',
  heart: '♥',
  diamond: '♦',
  club: '♣',
};

export const isRedSuit = (s: Suit): boolean => s === 'heart' || s === 'diamond';

/** 同点数时的花色次序：黑桃 → 红桃 → 梅花 → 方块 */
const SUIT_ORDER: Record<Suit, number> = { spade: 0, heart: 1, club: 2, diamond: 3 };

/** 手牌排序：点数升序（A 最大），同点数按花色固定次序 */
export function compareCards(a: Card, b: Card): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
}

export function sortHand(cards: Card[]): Card[] {
  return cards.slice().sort(compareCards);
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}-${rank}`, suit, rank });
    }
  }
  return deck;
}

export function rankLabel(rank: Rank): string {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return String(rank);
}

/** 牌面贡献的筹码：2-10 按点数，J/Q/K 为 10，A 为 11 */
export function cardChips(card: Card): number {
  if (card.rank === 14) return 11;
  if (card.rank >= 11) return 10;
  return card.rank;
}

export function cardLabel(card: Card): string {
  return `${SUIT_SYMBOL[card.suit]}${rankLabel(card.rank)}`;
}

/** 增强与蜡封的展示文案。卡面用短标签，悬浮与牌堆面板用长描述。 */
export const ENHANCEMENT_LABEL: Record<Enhancement, string> = {
  bonus: '附加',
  mult: '倍率',
  glass: '裂隙',
  steel: '铸铁',
  gold: '鎏金',
  wild: '幻形',
};

export const ENHANCEMENT_DESC: Record<Enhancement, string> = {
  bonus: '计分时 +30 筹码',
  mult: '计分时 +4 倍率',
  glass: '计分时 ×2 倍率，计分后这张牌永久碎裂',
  steel: '留在手牌不打出去时 ×1.5 倍率',
  gold: '回合结束若还留在手牌，+$3',
  wild: '同花判定时视为任意花色',
};

export const SEAL_LABEL: Record<Seal, string> = { red: '朱砂', gold: '金砂' };

export const SEAL_DESC: Record<Seal, string> = {
  red: '计分时这张牌再结算一次',
  gold: '这张牌每次计分 +$3',
};

/** 一张牌的完整说明，用于 title 悬浮提示 */
export function cardTitle(card: Card): string {
  const parts = [cardLabel(card)];
  if (card.enhancement) parts.push(`${ENHANCEMENT_LABEL[card.enhancement]}：${ENHANCEMENT_DESC[card.enhancement]}`);
  if (card.seal) parts.push(`${SEAL_LABEL[card.seal]}蜡封：${SEAL_DESC[card.seal]}`);
  return parts.join('\n');
}

/** 测试与调试用的紧凑构造器：card('s', 14) => ♠A；第四个参数可选增强/蜡封 */
export function card(
  suit: 's' | 'h' | 'd' | 'c',
  rank: Rank,
  enhancement?: Enhancement,
  seal?: Seal,
): Card {
  const map: Record<string, Suit> = { s: 'spade', h: 'heart', d: 'diamond', c: 'club' };
  const s = map[suit];
  const out: Card = { id: `${s}-${rank}`, suit: s, rank };
  if (enhancement) out.enhancement = enhancement;
  if (seal) out.seal = seal;
  return out;
}
