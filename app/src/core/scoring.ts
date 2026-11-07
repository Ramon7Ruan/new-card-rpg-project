import { cardChips, cardLabel, ENHANCEMENT_LABEL } from './cards';
import { evaluateHand } from './handEval';
import { baseFor, HAND_LABEL } from './hands';
import { getJoker, type JokerCtx } from './jokers';
import type { BlindRule, Card, HandType, JokerInstance, ScoreEvent, ScoreResult } from './types';

export interface ScoreInput {
  played: Card[];
  /** 留在手牌、这次不打的牌。铸铁（steel）靠它生效。 */
  held?: Card[];
  jokers: JokerInstance[];
  /** 每种牌型各自的等级，M0 恒为 1 */
  handLevels: Record<HandType, number>;
  money: number;
  handsLeft: number;
  discardsUsed: number;
  ante: number;
  /** Boss 规则：被压制的牌不计筹码，但仍参与牌型识别 */
  rule?: BlindRule | null;
}

/** 被 Boss 规则压制的牌：花色被点名，或人头牌被点名 */
function isDebuffed(card: Card, rule: BlindRule | null): boolean {
  if (!rule) return false;
  if (rule.debuffSuit && card.suit === rule.debuffSuit) return true;
  if (rule.debuffFace && card.rank >= 11 && card.rank <= 13) return true;
  return false;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * 单张牌的「一次」结算：先牌面筹码，再增强，最后蜡封的金钱效果。
 * 朱砂蜡封会把这一整套再跑一遍，所以必须抽成函数，不能内联两处。
 *
 * 增强里只有三种在「这张牌自己计分」时生效：
 *   bonus → +30 筹码；mult → +4 倍率；glass → ×2 倍率。
 *   steel / gold 是「留手」效果，wild 只影响牌型识别，都不进这里。
 */
function scoreCardOnce(
  card: Card,
  chips: number,
  mult: number,
): { chips: number; mult: number; money: number } {
  let nextChips = chips + cardChips(card);
  let nextMult = mult;
  let money = 0;

  switch (card.enhancement) {
    case 'bonus':
      nextChips += 30;
      break;
    case 'mult':
      nextMult += 4;
      break;
    case 'glass':
      nextMult *= 2;
      break;
    default:
      break;
  }

  if (card.seal === 'gold') money += 3;

  return { chips: nextChips, mult: nextMult, money };
}

function cardEventLabel(card: Card): string {
  return card.enhancement ? `${cardLabel(card)} · ${ENHANCEMENT_LABEL[card.enhancement]}` : cardLabel(card);
}

/**
 * 计分管线。顺序是硬约定，不可调整：
 *   牌型基础值
 *   → 逐张计分牌（左→右）：牌面筹码 → 增强 → 金砂蜡封；有朱砂则整套再来一遍
 *   → 留手牌里的铸铁（×1.5 倍率，逐张相乘）
 *   → 小丑槽位（左→右，+筹码→+倍率→×倍率）
 *   → 筹码 × 倍率
 *
 * 返回的 events 就是动画层的唯一数据源。动画层不允许重算。
 */
export function scoreHand(input: ScoreInput): ScoreResult {
  const evalResult = evaluateHand(input.played);
  const base = baseFor(evalResult.type, input.handLevels[evalResult.type] ?? 1);

  let chips = base.chips;
  let mult = base.mult;
  let money = 0;

  const events: ScoreEvent[] = [
    {
      kind: 'hand',
      label: HAND_LABEL[evalResult.type],
      chipsDelta: base.chips,
      multDelta: base.mult,
      chipsAfter: chips,
      multAfter: mult,
    },
  ];

  const scoringSet = new Set(evalResult.scoringCardIds);
  const rule = input.rule ?? null;
  const scoringCards = input.played.filter((c) => scoringSet.has(c.id) && !isDebuffed(c, rule));
  const debuffedCardIds = input.played
    .filter((c) => scoringSet.has(c.id) && isDebuffed(c, rule))
    .map((c) => c.id);

  for (const card of scoringCards) {
    const label = cardEventLabel(card);

    let chipsBefore = chips;
    let multBefore = mult;
    const first = scoreCardOnce(card, chips, mult);
    chips = first.chips;
    mult = first.mult;
    money += first.money;
    events.push({
      kind: 'card',
      label,
      chipsDelta: chips - chipsBefore,
      multDelta: mult - multBefore,
      chipsAfter: chips,
      multAfter: mult,
      sourceId: card.id,
    });

    // 朱砂蜡封：牌面与增强整套重触发一次（金砂也随之再给一次钱）
    if (card.seal === 'red') {
      chipsBefore = chips;
      multBefore = mult;
      const again = scoreCardOnce(card, chips, mult);
      chips = again.chips;
      mult = again.mult;
      money += again.money;
      events.push({
        kind: 'card',
        label: `${label} · 朱砂重触发`,
        chipsDelta: chips - chipsBefore,
        multDelta: mult - multBefore,
        chipsAfter: chips,
        multAfter: mult,
        sourceId: card.id,
      });
    }
  }

  // 铸铁：没打出去的牌也能加乘。顺序固定在计分牌之后、小丑之前。
  for (const card of input.held ?? []) {
    if (card.enhancement !== 'steel') continue;
    const before = mult;
    mult = round2(mult * 1.5);
    events.push({
      kind: 'card',
      label: `${cardLabel(card)} · 铸铁（留手）`,
      chipsDelta: 0,
      multDelta: mult - before,
      chipsAfter: chips,
      multAfter: mult,
      sourceId: card.id,
    });
  }

  const ctx: JokerCtx = {
    played: input.played,
    scoring: scoringCards,
    handType: evalResult.type,
    money: input.money,
    handsLeft: input.handsLeft,
    discardsUsed: input.discardsUsed,
    ante: input.ante,
  };

  for (const inst of input.jokers) {
    const def = getJoker(inst.defId);
    if (!def?.onScored) continue;

    const mods = { chips: 0, mult: 0, xMult: 1 };
    def.onScored(ctx, mods);

    if (mods.chips === 0 && mods.mult === 0 && mods.xMult === 1) continue;

    const multBefore = mult;
    chips += mods.chips;
    mult = round2((mult + mods.mult) * mods.xMult);

    events.push({
      kind: 'joker',
      label: def.name,
      chipsDelta: mods.chips,
      multDelta: mult - multBefore,
      chipsAfter: chips,
      multAfter: mult,
      sourceId: def.id,
    });
  }

  return {
    handType: evalResult.type,
    chips,
    mult: round2(mult),
    score: Math.round(chips * mult),
    money,
    events,
    scoringCardIds: scoringCards.map((c) => c.id),
    debuffedCardIds,
  };
}
