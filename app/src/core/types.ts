/** 全局类型定义。所有游戏状态都必须可 JSON 序列化（存档要求）。 */

export type Suit = 'spade' | 'heart' | 'diamond' | 'club';

/** 2..10, 11=J, 12=Q, 13=K, 14=A */
export type Rank = number;

export interface Card {
  /** 唯一 id，形如 "spade-14" */
  id: string;
  suit: Suit;
  rank: Rank;
}

export type HandType =
  | 'highCard'
  | 'pair'
  | 'twoPair'
  | 'threeOfAKind'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'fourOfAKind'
  | 'straightFlush'
  | 'fiveOfAKind'
  | 'flushHouse'
  | 'flushFive';

/** 计分管线的单步记录。动画层只消费这个，不重算。 */
export interface ScoreEvent {
  kind: 'hand' | 'card' | 'joker';
  label: string;
  chipsDelta: number;
  multDelta: number;
  chipsAfter: number;
  multAfter: number;
  sourceId?: string;
}

export interface ScoreResult {
  handType: HandType;
  chips: number;
  mult: number;
  score: number;
  events: ScoreEvent[];
  scoringCardIds: string[];
}

export interface JokerInstance {
  uid: string;
  defId: string;
}

export interface ShopOffer {
  defId: string;
  cost: number;
  sold: boolean;
}

export interface ShopState {
  offers: ShopOffer[];
  rerollCost: number;
  rerolls: number;
}

export type Phase = 'blindSelect' | 'playing' | 'cashOut' | 'shop' | 'won' | 'lost';

export interface RunState {
  seed: string;
  ante: number;
  /** 0=小盲 1=大盲 2=Boss */
  blindIndex: number;
  money: number;

  deck: Card[];
  discardPile: Card[];
  hand: Card[];

  jokers: JokerInstance[];
  handLevels: Record<HandType, number>;

  handsLeft: number;
  discardsLeft: number;
  discardsUsed: number;
  roundScore: number;
  target: number;

  /** 存档与洗牌的确定性计数器 */
  shuffleCount: number;

  phase: Phase;
  shop: ShopState | null;
  lastScore: ScoreResult | null;

  selected: string[];
}
