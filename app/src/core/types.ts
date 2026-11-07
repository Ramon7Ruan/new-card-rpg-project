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
  /** 被 Boss 规则压制、不计分的牌（仍参与牌型识别） */
  debuffedCardIds: string[];
}

/**
 * Boss 盲注的声明式规则。全部字段可选，未设置即无影响。
 * 必须是纯数据（可 JSON 序列化），不能放函数——否则存档会坏。
 */
export interface BlindRule {
  /** 目标分数倍率，如 1.5 */
  targetMultiplier?: number;
  /** 禁止弃牌 */
  forbidDiscards?: boolean;
  /** 手牌上限增量 */
  handSizeDelta?: number;
  /** 必须恰好打出 N 张才能出牌 */
  requirePlayedCards?: number;
  /** 该花色不计分 */
  debuffSuit?: Suit;
  /** J/Q/K 不计分 */
  debuffFace?: boolean;
}

export interface JokerInstance {
  uid: string;
  defId: string;
}

/** 消耗品实例（铭文等）。用掉即从槽位移除。 */
export interface ConsumableInstance {
  uid: string;
  defId: string;
}

export type ShopKind = 'joker' | 'consumable';

export interface ShopOffer {
  defId: string;
  /** 商品类型，决定买进哪个槽位 */
  kind: ShopKind;
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
  /** 存档结构版本，用于迁移 */
  version: number;
  seed: string;
  ante: number;
  /** 0=小盲 1=大盲 2=Boss */
  blindIndex: number;
  money: number;

  deck: Card[];
  discardPile: Card[];
  hand: Card[];

  jokers: JokerInstance[];
  /** 消耗品槽，上限 MAX_CONSUMABLES */
  consumables: ConsumableInstance[];
  handLevels: Record<HandType, number>;

  /** 当前盲注的 Boss（非 Boss 盲注为 null） */
  bossId: string | null;
  /** 已解析的 Boss 规则，纯数据可序列化 */
  bossRule: BlindRule | null;
  /** 本回合手牌上限（Boss 可减少） */
  handSize: number;

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
