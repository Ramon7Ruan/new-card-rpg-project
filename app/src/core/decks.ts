import { RANKS, SUITS } from './cards';
import type { Card, Rank, Suit } from './types';

/**
 * 牌组（P5）：开局时整副牌的构成不同，直接改变「什么牌型容易凑」。
 * 只改牌堆内容，不改规则——所以计分、Boss、商店全都不用动。
 */

export type DeckId = 'standard' | 'redblack' | 'slim';

export interface DeckDef {
  id: DeckId;
  name: string;
  desc: string;
  suits: Suit[];
  ranks: Rank[];
}

export const DECKS: DeckDef[] = [
  {
    id: 'standard',
    name: '标准牌组',
    desc: '四个花色各 13 张，什么都能玩',
    suits: SUITS,
    ranks: RANKS,
  },
  {
    id: 'redblack',
    name: '双色牌组',
    desc: '只有红桃与方块（26 张）—— 同花与同花顺好凑得多',
    suits: ['heart', 'diamond'],
    ranks: RANKS,
  },
  {
    id: 'slim',
    name: '精简牌组',
    desc: '去掉 2–6 剩下 32 张 —— 起手全是大牌，对子与两对更常见',
    suits: SUITS,
    ranks: RANKS.filter((r) => r >= 7),
  },
];

export const DEFAULT_DECK: DeckId = 'standard';

const BY_ID = new Map<string, DeckDef>(DECKS.map((d) => [d.id, d]));

export function getDeck(id: string): DeckDef | undefined {
  return BY_ID.get(id);
}

export function isDeckId(id: unknown): id is DeckId {
  return typeof id === 'string' && BY_ID.has(id);
}

/** 牌数 = 花色数 × 点数数 */
export function deckSize(def: DeckDef): number {
  return def.suits.length * def.ranks.length;
}

/** 造出未洗过的整副牌。id 与标准牌组同构（`suit-rank`），所以改造/复制逻辑不用特殊处理。 */
export function buildDeck(id: DeckId = DEFAULT_DECK): Card[] {
  const def = getDeck(id) ?? DECKS[0];
  const cards: Card[] = [];
  for (const suit of def.suits) {
    for (const rank of def.ranks) {
      cards.push({ id: `${suit}-${rank}`, suit, rank });
    }
  }
  return cards;
}
