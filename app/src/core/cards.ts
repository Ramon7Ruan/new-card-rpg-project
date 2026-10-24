import type { Card, Rank, Suit } from './types';

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

/** 测试与调试用的紧凑构造器：card('s', 14) => ♠A */
export function card(suit: 's' | 'h' | 'd' | 'c', rank: Rank): Card {
  const map: Record<string, Suit> = { s: 'spade', h: 'heart', d: 'diamond', c: 'club' };
  const s = map[suit];
  return { id: `${s}-${rank}`, suit: s, rank };
}
