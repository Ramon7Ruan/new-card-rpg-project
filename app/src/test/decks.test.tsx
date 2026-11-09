import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { buildDeck, DECKS, deckSize, DEFAULT_DECK, getDeck, isDeckId } from '../core/decks';
import { migrateSave } from '../core/persist';
import { createRun, reducer, SAVE_VERSION } from '../core/run';
import { NewRunPanel } from '../ui/App';
import type { RunState } from '../core/types';

/**
 * P5：3 种牌组。
 * 牌组只改「整副牌由哪些牌组成」，规则、计分、Boss 一律不动——
 * 所以这里不需要重测计分，只要保证牌堆构成、开局、存档三条线正确。
 */

describe('P5 牌组数据表', () => {
  it('3 种牌组，id 与名字都不重复', () => {
    expect(DECKS).toHaveLength(3);
    expect(new Set(DECKS.map((d) => d.id)).size).toBe(3);
    expect(new Set(DECKS.map((d) => d.name)).size).toBe(3);
  });

  it('牌数分别是 52 / 26 / 32', () => {
    expect(deckSize(getDeck('standard')!)).toBe(52);
    expect(deckSize(getDeck('redblack')!)).toBe(26);
    expect(deckSize(getDeck('slim')!)).toBe(32);
  });

  it('isDeckId 只认三种 id', () => {
    expect(isDeckId('standard')).toBe(true);
    expect(isDeckId('redblack')).toBe(true);
    expect(isDeckId('slim')).toBe(true);
    expect(isDeckId('nope')).toBe(false);
    expect(isDeckId(undefined)).toBe(false);
    expect(isDeckId(3)).toBe(false);
  });
});

describe('P5 牌堆构成', () => {
  it('标准：四种花色 × 13 张，id 唯一', () => {
    const deck = buildDeck('standard');
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    const suits = new Set(deck.map((c) => c.suit));
    expect(suits.size).toBe(4);
  });

  it('双色：只有红桃与方块', () => {
    const deck = buildDeck('redblack');
    expect(deck.every((c) => c.suit === 'heart' || c.suit === 'diamond')).toBe(true);
    expect(deck).toHaveLength(26);
  });

  it('精简：没有 2–6，最低是 7', () => {
    const deck = buildDeck('slim');
    expect(deck.every((c) => c.rank >= 7)).toBe(true);
    expect(Math.min(...deck.map((c) => c.rank))).toBe(7);
    expect(deck).toHaveLength(32);
  });

  it('三种牌组的 id 都是 `花色-点数` 形式（改造/复制逻辑不用特判）', () => {
    for (const def of DECKS) {
      for (const card of buildDeck(def.id)) {
        expect(card.id).toBe(`${card.suit}-${card.rank}`);
      }
    }
  });
});

describe('P5 开局与存档', () => {
  it('createRun 用指定牌组，牌堆数量与构成都跟着变', () => {
    const slim = createRun('DECK1', 'slim');
    expect(slim.deckId).toBe('slim');
    expect(slim.deck).toHaveLength(32);
    expect(slim.deck.every((c) => c.rank >= 7)).toBe(true);
  });

  it('同一 seed + 同一牌组 → 洗牌结果一致', () => {
    expect(createRun('DECK2', 'redblack').deck).toEqual(createRun('DECK2', 'redblack').deck);
  });

  it('牌组会被洗过（不是按构造顺序发）', () => {
    const deck = createRun('DECK3', 'standard').deck;
    const sorted = [...deck].sort((a, b) => a.id.localeCompare(b.id));
    expect(deck.map((c) => c.id)).not.toEqual(sorted.map((c) => c.id));
  });

  it('newRun 可以换牌组', () => {
    const s = reducer(createRun('DECK4'), { type: 'newRun', deckId: 'redblack' });
    expect(s.deckId).toBe('redblack');
    expect(s.deck).toHaveLength(26);
  });

  it('牌组跨存档保留', () => {
    const s = createRun('DECK5', 'slim');
    const restored = migrateSave(JSON.parse(JSON.stringify(s))) as RunState;
    expect(restored.deckId).toBe('slim');
    expect(restored.version).toBe(SAVE_VERSION);
  });

  it('旧存档没有 deckId → 标准牌组；坏值也回退', () => {
    const raw = JSON.parse(JSON.stringify(createRun('DECK6'))) as Record<string, unknown>;
    delete raw.deckId;
    expect(migrateSave(raw)?.deckId).toBe(DEFAULT_DECK);

    const bad = { ...raw, deckId: 'not-a-deck' };
    expect(migrateSave(bad)?.deckId).toBe(DEFAULT_DECK);
  });
});

describe('P5 三种牌组各自能打完整局', () => {
  /** 把目标压到 1，只验流程与牌数守恒（平衡另有 balance.test） */
  function playFull(deckId: 'standard' | 'redblack' | 'slim'): RunState {
    let s = createRun(`FULL-${deckId}`, deckId, 'normal');
    const total = s.maxAnte * 3;

    for (let i = 0; i < total; i++) {
      s = reducer(s, { type: 'selectBlind' });
      expect(s.phase).toBe('playing');
      s = { ...s, target: 1 };

      const need = s.bossRule?.requirePlayedCards ?? Math.min(5, s.hand.length);
      for (const c of s.hand.slice(0, need)) {
        s = reducer(s, { type: 'toggleCard', cardId: c.id });
      }
      s = reducer(s, { type: 'playHand' });
      expect(s.phase).toBe('cashOut');
      s = reducer(s, { type: 'cashOut' });
      if (s.phase === 'shop') s = reducer(s, { type: 'leaveShop' });
    }
    return s;
  }

  it('标准牌组：15 个盲注打完通关，牌数始终 52', () => {
    const s = playFull('standard');
    expect(s.phase).toBe('won');
    expect(s.deck.length + s.hand.length + s.discardPile.length).toBe(52);
  });

  it('双色牌组：26 张，通关后仍是 26 张', () => {
    const s = playFull('redblack');
    expect(s.phase).toBe('won');
    expect(s.deck.length + s.hand.length + s.discardPile.length).toBe(26);
  });

  it('精简牌组：32 张，通关后仍是 32 张', () => {
    const s = playFull('slim');
    expect(s.phase).toBe('won');
    expect(s.deck.length + s.hand.length + s.discardPile.length).toBe(32);
  });
});

describe('P5 新局面板', () => {
  const html = renderToString(<NewRunPanel onStart={() => {}} onClose={() => {}} />);

  it('列出三种牌组与各自张数', () => {
    expect(html).toContain('标准牌组');
    expect(html).toContain('双色牌组');
    expect(html).toContain('精简牌组');
    expect(html).toContain('52 张');
    expect(html).toContain('26 张');
    expect(html).toContain('32 张');
  });

  it('有取消入口', () => {
    expect(html).toContain('取消');
  });
});
