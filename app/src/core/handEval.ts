import type { Card, HandType } from './types';

export interface HandEvalResult {
  type: HandType;
  /** 参与计分的牌（不是全部打出的牌） */
  scoringCardIds: string[];
}

/** 判断五个点数是否连续（A 可作 1：A-2-3-4-5） */
function isFiveConsecutive(ranks: number[]): boolean {
  const unique = [...new Set(ranks)].sort((a, b) => a - b);
  if (unique.length !== 5) return false;
  if (unique[4] - unique[0] === 4) return true;
  if (unique[4] === 14) {
    const low = [1, ...unique.slice(0, 4)].sort((a, b) => a - b);
    return low[4] - low[0] === 4 && new Set(low).size === 5;
  }
  return false;
}

function groupByRank(cards: Card[]): Card[][] {
  const map = new Map<number, Card[]>();
  for (const c of cards) {
    const arr = map.get(c.rank);
    if (arr) arr.push(c);
    else map.set(c.rank, [c]);
  }
  // 先按数量降序，再按点数降序
  return [...map.values()].sort((a, b) => b.length - a.length || b[0].rank - a[0].rank);
}

export function evaluateHand(cards: Card[]): HandEvalResult {
  const n = cards.length;
  if (n === 0) return { type: 'highCard', scoringCardIds: [] };

  const allIds = () => cards.map((c) => c.id);
  const groups = groupByRank(cards);
  const suits = new Set(cards.map((c) => c.suit));
  const isFlush = n === 5 && suits.size === 1;
  const isStraight = n === 5 && isFiveConsecutive(cards.map((c) => c.rank));
  const isFullHouseShape = groups.length === 2 && groups[0].length === 3 && groups[1].length === 2;

  if (n === 5 && isFlush && groups.length === 1) return { type: 'flushFive', scoringCardIds: allIds() };
  if (isFlush && isFullHouseShape) return { type: 'flushHouse', scoringCardIds: allIds() };
  if (groups[0].length === 5) return { type: 'fiveOfAKind', scoringCardIds: allIds() };
  if (isFlush && isStraight) return { type: 'straightFlush', scoringCardIds: allIds() };
  if (groups[0].length === 4) return { type: 'fourOfAKind', scoringCardIds: groups[0].map((c) => c.id) };
  if (isFullHouseShape) return { type: 'fullHouse', scoringCardIds: allIds() };
  if (isFlush) return { type: 'flush', scoringCardIds: allIds() };
  if (isStraight) return { type: 'straight', scoringCardIds: allIds() };
  if (groups[0].length === 3) return { type: 'threeOfAKind', scoringCardIds: groups[0].map((c) => c.id) };
  if (groups[0].length === 2 && groups[1] !== undefined && groups[1].length === 2) {
    return { type: 'twoPair', scoringCardIds: [...groups[0], ...groups[1]].map((c) => c.id) };
  }
  if (groups[0].length === 2) return { type: 'pair', scoringCardIds: groups[0].map((c) => c.id) };

  const highest = [...cards].sort((a, b) => b.rank - a.rank)[0];
  return { type: 'highCard', scoringCardIds: [highest.id] };
}

export type { HandType };
