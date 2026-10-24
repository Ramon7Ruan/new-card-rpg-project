import { cardChips, cardLabel } from './cards';
import { evaluateHand } from './handEval';
import { baseFor, HAND_LABEL } from './hands';
import { getJoker, type JokerCtx } from './jokers';
import type { Card, HandType, JokerInstance, ScoreEvent, ScoreResult } from './types';

export interface ScoreInput {
  played: Card[];
  jokers: JokerInstance[];
  /** 每种牌型各自的等级，M0 恒为 1 */
  handLevels: Record<HandType, number>;
  money: number;
  handsLeft: number;
  discardsUsed: number;
  ante: number;
}

/**
 * 计分管线。顺序是硬约定，不可调整：
 *   牌型基础值 → 逐张计分牌（左→右）→ 小丑槽位（左→右，+筹码→+倍率→×倍率）→ 筹码 × 倍率
 *
 * 返回的 events 就是动画层的唯一数据源。动画层不允许重算。
 */
export function scoreHand(input: ScoreInput): ScoreResult {
  const evalResult = evaluateHand(input.played);
  const base = baseFor(evalResult.type, input.handLevels[evalResult.type] ?? 1);

  let chips = base.chips;
  let mult = base.mult;

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
  const scoringCards = input.played.filter((c) => scoringSet.has(c.id));

  for (const card of scoringCards) {
    const delta = cardChips(card);
    chips += delta;
    events.push({
      kind: 'card',
      label: cardLabel(card),
      chipsDelta: delta,
      multDelta: 0,
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
    mult = (mult + mods.mult) * mods.xMult;

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
    mult,
    score: chips * mult,
    events,
    scoringCardIds: evalResult.scoringCardIds,
  };
}
