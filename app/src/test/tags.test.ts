import { describe, expect, it } from 'vitest';
import { targetFor } from '../core/blinds';
import { card } from '../core/cards';
import { migrateSave } from '../core/persist';
import { createRun, reducer, SAVE_VERSION } from '../core/run';
import { getTag, rollTag, TAGS } from '../core/tags';
import type { RunState } from '../core/types';

/** 停在盲注选择页的初始局面 */
function atSelect(seed = 'TAGTEST', over: Partial<RunState> = {}): RunState {
  return { ...createRun(seed), ...over };
}

describe('P3-3 标签定义与抽取', () => {
  it('4 个标签，id 唯一，都有说明', () => {
    expect(TAGS).toHaveLength(4);
    expect(new Set(TAGS.map((t) => t.id)).size).toBe(4);
    for (const t of TAGS) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.desc.length).toBeGreaterThan(0);
    }
  });

  it('抽标签是确定性的', () => {
    expect(rollTag('S', '1:0').id).toBe(rollTag('S', '1:0').id);
    const ids = new Set([1, 2, 3, 4, 5, 6].map((a) => rollTag('S', `1:${a}`).id));
    expect(ids.size).toBeGreaterThan(1);
  });

  it('每张标签的 id 都能反查', () => {
    for (const t of TAGS) expect(getTag(t.id)?.name).toBe(t.name);
  });
});

describe('P3-3 跳过盲注', () => {
  it('跳过小盲 → 进大盲，拿 1 个标签，钱不变（除标签本身的效果）', () => {
    const s = atSelect();
    const tag = rollTag(s.seed, `${s.ante}:${s.blindIndex}`);
    const after = reducer(s, { type: 'skipBlind' });

    expect(after.blindIndex).toBe(1);
    expect(after.phase).toBe('blindSelect');
    expect(after.target).toBe(targetFor(after.ante, 1));
    expect(after.tags).toEqual([tag.id]);
    expect(after.hand).toHaveLength(0);

    // 只有「现钱袋」会改钱
    if (tag.id === 'tag-cash') expect(after.money).toBe(s.money + 6);
    else expect(after.money).toBe(s.money);
  });

  it('跳过不消耗出牌次数、不加分、不给盲注奖励', () => {
    const s = atSelect();
    const after = reducer(s, { type: 'skipBlind' });
    expect(after.handsLeft).toBe(s.handsLeft);
    expect(after.roundScore).toBe(0);
  });

  it('Boss 盲注不能跳过', () => {
    const s = atSelect('TAGTEST', { blindIndex: 2 });
    expect(reducer(s, { type: 'skipBlind' })).toBe(s);
  });

  it('牌桌上不能跳过（只有在选择页可以）', () => {
    const s = reducer(atSelect(), { type: 'selectBlind' });
    expect(reducer(s, { type: 'skipBlind' })).toBe(s);
  });

  it('连续跳过两次：小盲 → 大盲 → Boss，共 2 个标签', () => {
    let s = atSelect('TAGS2');
    s = reducer(s, { type: 'skipBlind' });
    s = reducer(s, { type: 'skipBlind' });
    expect(s.blindIndex).toBe(2);
    expect(s.tags).toHaveLength(2);
    expect(s.target).toBe(targetFor(s.ante, 2));
  });

  it('跳过后仍能正常进入下一盲注，Boss 规则照常生效', () => {
    let s = atSelect('TAGS3');
    s = reducer(s, { type: 'skipBlind' });
    s = reducer(s, { type: 'skipBlind' });
    s = reducer(s, { type: 'selectBlind' });
    expect(s.phase).toBe('playing');
    expect(s.bossId).not.toBeNull();
    expect(s.bossRule).not.toBeNull();
  });

  it('跳过时目标分数按新盲注重算（不是沿用旧的）', () => {
    const s = atSelect('TAGS4');
    const after = reducer(s, { type: 'skipBlind' });
    expect(after.target).toBe(targetFor(1, 1));
    expect(after.target).not.toBe(s.target);
  });
});

/** 找一个「跳过小盲一定抽到这张标签」的种子，让效果测试不用写 if */
function seedForTag(tagId: string): string {
  for (let i = 0; i < 2000; i++) {
    const seed = `SEED${i}`;
    if (rollTag(seed, '1:0').id === tagId) return seed;
  }
  throw new Error(`找不到抽到 ${tagId} 的种子`);
}

describe('P3-3 四种标签的效果', () => {
  it('现钱袋：+$6', () => {
    const s = atSelect(seedForTag('tag-cash'), { money: 10 });
    const after = reducer(s, { type: 'skipBlind' });
    expect(after.tags).toEqual(['tag-cash']);
    expect(after.money).toBe(16);
  });

  it('手记残页：恰好一个牌型 +1 级', () => {
    const s = atSelect(seedForTag('tag-level'));
    const after = reducer(s, { type: 'skipBlind' });
    expect(after.tags).toEqual(['tag-level']);

    const changed = (Object.keys(s.handLevels) as (keyof typeof s.handLevels)[]).filter(
      (k) => after.handLevels[k] !== s.handLevels[k],
    );
    expect(changed).toHaveLength(1);
    expect(after.handLevels[changed[0]]).toBe(s.handLevels[changed[0]] + 1);
  });

  it('会员卡：下一次重摇免费，钱不动、次数被消耗', () => {
    const s = atSelect(seedForTag('tag-reroll'));
    const skipped = reducer(s, { type: 'skipBlind' });
    expect(skipped.tags).toEqual(['tag-reroll']);
    expect(skipped.freeRerolls).toBe(1);

    const shopState: RunState = {
      ...skipped,
      phase: 'shop',
      money: 0,
      shop: {
        jokers: [],
        consumables: [],
        voucher: null,
        packs: [],
        rerollCost: 5,
        rerolls: 0,
      },
    };
    const after = reducer(shopState, { type: 'reroll' });
    expect(after.money).toBe(0);
    expect(after.freeRerolls).toBe(0);
    expect(after.shop!.rerolls).toBe(1);
    expect(after.shop!.rerollCost).toBe(6);

    // 第二次没有免费次数，钱不够就摇不动
    expect(reducer(after, { type: 'reroll' })).toBe(after);
  });

  it('火漆印：牌堆里恰好一张牌变成「附加」', () => {
    const s = atSelect(seedForTag('tag-enhance'), {
      deck: [card('s', 2), card('h', 3), card('d', 4)],
      hand: [],
      discardPile: [],
    });
    const after = reducer(s, { type: 'skipBlind' });
    expect(after.tags).toEqual(['tag-enhance']);
    expect(after.deck).toHaveLength(3);
    expect(after.deck.filter((c) => c.enhancement === 'bonus')).toHaveLength(1);
  });

  it('火漆印在「所有牌都已强化」时折成 $4，不留空效果', () => {
    const s = atSelect(seedForTag('tag-enhance'), {
      money: 10,
      deck: [card('s', 2, 'mult'), card('h', 3, 'glass')],
      hand: [],
      discardPile: [],
    });
    const after = reducer(s, { type: 'skipBlind' });
    expect(after.money).toBe(14);
  });
});

describe('P3-4 标签与跳过进存档', () => {
  it('tags / freeRerolls 跨存档保留', () => {
    let s = atSelect('SAVETAG');
    s = reducer(s, { type: 'skipBlind' });
    s = { ...s, freeRerolls: 2 };
    const restored = migrateSave(JSON.parse(JSON.stringify(s))) as RunState;
    expect(restored.tags).toEqual(s.tags);
    expect(restored.freeRerolls).toBe(2);
    expect(restored.version).toBe(SAVE_VERSION);
  });

  it('旧存档没有这两个字段 → 空数组 / 0', () => {
    const raw = JSON.parse(JSON.stringify(createRun('OLDTAG'))) as Record<string, unknown>;
    delete raw.tags;
    delete raw.freeRerolls;
    const m = migrateSave(raw);
    expect(m?.tags).toEqual([]);
    expect(m?.freeRerolls).toBe(0);
  });

  it('认不出的标签被丢掉，负数免费次数归零', () => {
    const raw = JSON.parse(JSON.stringify(createRun('BADTAG'))) as Record<string, unknown>;
    raw.tags = ['tag-cash', 'tag-gone'];
    raw.freeRerolls = -3;
    const m = migrateSave(raw);
    expect(m?.tags).toEqual(['tag-cash']);
    expect(m?.freeRerolls).toBe(0);
  });
});
