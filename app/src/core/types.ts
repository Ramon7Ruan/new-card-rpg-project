/** 全局类型定义。所有游戏状态都必须可 JSON 序列化（存档要求）。 */

import type { DeckId } from './decks';
import type { DifficultyId } from './difficulty';

export type Suit = 'spade' | 'heart' | 'diamond' | 'club';

/** 2..10, 11=J, 12=Q, 13=K, 14=A */
export type Rank = number;

/**
 * 卡牌增强（P2）。每条都走独立加成通道，见 scoring.ts 的结算顺序：
 * - bonus  附加：+30 筹码
 * - mult   倍率：+4 倍率
 * - glass  裂隙：×2 倍率，但计分后该牌永久碎裂（确定性，不掷骰）
 * - steel  铸铁：留在手牌中未打出时 ×1.5 倍率
 * - gold   鎏金：回合结束若还留在手牌，+$3
 * - wild   幻形：同花判定时视为任意花色
 */
export type Enhancement = 'bonus' | 'mult' | 'glass' | 'steel' | 'gold' | 'wild';

/**
 * 蜡封（P2）。一张牌可以同时有增强与蜡封：
 * - red   朱砂：该牌在计分时结算两次（重触发）
 * - gold  金砂：该牌计分时 +$3
 */
export type Seal = 'red' | 'gold';

export interface Card {
  /** 唯一 id，形如 "spade-14"。**身份不随花色/点数改写**，复制牌用 "#copyN" 后缀 */
  id: string;
  suit: Suit;
  rank: Rank;
  enhancement?: Enhancement;
  seal?: Seal;
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
  /** 本次计分额外获得的金钱（金砂蜡封），由 playHand 计入资金 */
  money: number;
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
  /** 本回合出牌次数增量（P5），如 -1 */
  handsDelta?: number;
  /** 本回合弃牌次数增量（P5），如 -2 */
  discardsDelta?: number;
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

/** 旧存档里的商品类型标记，只用于迁移；新结构靠货架本身区分类型 */
export type ShopKind = 'joker' | 'consumable';

export interface ShopOffer {
  defId: string;
  cost: number;
  sold: boolean;
}

/**
 * 商店状态：**两个独立货架**（P3）。类型由货架决定，商品上不再存 kind，
 * 避免出现「kind 与所在货架不一致」这种只有迁移时才会碰到的坏状态。
 */
/**
 * 补充包（P3）：买下后开包，从 N 张里选 1 张（也可以整包跳过）。
 * 开包的候选放在 RunState.pack 里，是**纯数据**——刷新页面不会丢包。
 */
export type PackKind = 'joker' | 'planet' | 'charm' | 'standard';

export type PackChoice =
  | { kind: 'joker'; defId: string }
  | { kind: 'consumable'; defId: string }
  /** 标准包：直接给一张牌（可能带增强），进牌堆 */
  | { kind: 'card'; card: Card };

export interface PackState {
  /** 开的是哪种包，用于标题与文案 */
  packId: string;
  choices: PackChoice[];
}

export interface ShopState {
  /** 小丑货架，默认 3 张（优惠券可加宽） */
  jokers: ShopOffer[];
  /** 星球 + 符咒货架，默认 2 张 */
  consumables: ShopOffer[];
  /** 优惠券货架，每次最多 1 张；池子空了为 null */
  voucher: ShopOffer | null;
  /** 补充包货架，固定 2 个 */
  packs: ShopOffer[];
  rerollCost: number;
  rerolls: number;
}

export type Phase = 'blindSelect' | 'playing' | 'cashOut' | 'shop' | 'won' | 'lost';

export interface RunState {
  /** 存档结构版本，用于迁移 */
  version: number;
  seed: string;
  /** 本局使用的牌组（P5），决定整副牌的构成 */
  deckId: DeckId;
  /** 本局难度（P5），决定打到第几个底注与 Boss 系数 */
  difficulty: DifficultyId;
  /** 这一局要打几个底注（由难度推导，存档里也存一份便于显示） */
  maxAnte: number;
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
  /** 已购买的优惠券 id（P3）。永久生效，进存档。 */
  vouchers: string[];
  /** 跳过盲注累计获得的标签 id（P3），只用于展示与回看 */
  tags: string[];
  /** 剩余免费重摇次数（「会员卡」标签），进商店时消耗 */
  freeRerolls: number;
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
  /** 已买下、正在开包的补充包。普通状态下为 null */
  pack: PackState | null;
  /** 开包计数器：给标准包生成的牌造唯一 id */
  packSeq: number;
  lastScore: ScoreResult | null;

  selected: string[];
}
