import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { targetFor, ANTE_TARGETS } from '../core/blinds';
import {
  antesFor,
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  getDifficulty,
  isDifficultyId,
  scaledTarget,
} from '../core/difficulty';
import { migrateSave } from '../core/persist';
import { createRun, reducer } from '../core/run';
import { NewRunPanel } from '../ui/App';
import type { RunState } from '../core/types';

/**
 * P5：4 级难度。
 * 难度只做两件事：这一局打几个底注、Boss 位目标乘多少。
 * 小盲/大盲的目标**不随难度变**——难度要加在关键关卡上。
 */

describe('P5 难度数据表', () => {
  it('4 档难度，id 与名字唯一，底注数递增', () => {
    expect(DIFFICULTIES).toHaveLength(4);
    expect(new Set(DIFFICULTIES.map((d) => d.id)).size).toBe(4);
    expect(new Set(DIFFICULTIES.map((d) => d.name)).size).toBe(4);

    const antes = DIFFICULTIES.map((d) => d.antes);
    expect(antes).toEqual([...antes].sort((a, b) => a - b));
    expect(antes[0]).toBe(4);
    expect(antes[antes.length - 1]).toBe(8);
  });

  it('Boss 系数不递减，且普通难度不打折也不加码', () => {
    const scales = DIFFICULTIES.map((d) => d.bossScale);
    expect(scales).toEqual([...scales].sort((a, b) => a - b));
    expect(getDifficulty('normal')?.bossScale).toBe(1);
  });

  it('难度对应的底注数不会超过目标表', () => {
    expect(antesFor('hell')).toBeLessThanOrEqual(ANTE_TARGETS.length);
    expect(antesFor('casual')).toBe(4);
  });

  it('isDifficultyId 只认四档', () => {
    expect(isDifficultyId('hell')).toBe(true);
    expect(isDifficultyId('nightmare')).toBe(false);
    expect(isDifficultyId(undefined)).toBe(false);
  });
});

describe('P5 目标计算（唯一入口）', () => {
  it('小盲/大盲不受难度与 Boss 系数影响', () => {
    for (const id of ['casual', 'normal', 'challenge', 'hell'] as const) {
      expect(scaledTarget(300, 0, id, 1.5)).toBe(300);
      expect(scaledTarget(450, 1, id, 1.5)).toBe(450);
    }
  });

  it('Boss 位 = 基础 × Boss 系数 × 难度系数', () => {
    expect(scaledTarget(600, 2, 'normal', 1)).toBe(600);
    expect(scaledTarget(600, 2, 'normal', 1.5)).toBe(900);
    expect(scaledTarget(600, 2, 'challenge', 1.5)).toBe(Math.round(600 * 1.5 * 1.15));
    expect(scaledTarget(600, 2, 'hell', 1)).toBe(780);
  });
});

describe('P5 难度进入对局', () => {
  it('createRun 默认普通：5 个底注', () => {
    const s = createRun('DIFF1');
    expect(s.difficulty).toBe(DEFAULT_DIFFICULTY);
    expect(s.maxAnte).toBe(5);
  });

  it('选地狱：8 个底注；选轻松：4 个', () => {
    expect(createRun('DIFF2', 'standard', 'hell').maxAnte).toBe(8);
    expect(createRun('DIFF3', 'standard', 'casual').maxAnte).toBe(4);
  });

  it('进 Boss 时目标按难度放大（铁壁 ×1.5 × 地狱 1.3）', () => {
    const base = { ...createRun('DIFF4', 'standard', 'hell'), ante: 1, blindIndex: 2 };
    const s = reducer(base, { type: 'selectBlind', bossId: 'rampart' });
    expect(s.target).toBe(Math.round(targetFor(1, 2) * 1.5 * 1.3));
  });

  it('非 Boss 盲注的目标不因难度变化', () => {
    const normal = reducer(createRun('DIFF5', 'standard', 'normal'), { type: 'selectBlind' });
    const hell = reducer(createRun('DIFF5', 'standard', 'hell'), { type: 'selectBlind' });
    expect(normal.target).toBe(hell.target);
    expect(normal.target).toBe(targetFor(1, 0));
  });

  it('通关判定跟着难度：普通在第 5 个底注结束，地狱还要继续', () => {
    const at = (ante: number, diff: 'normal' | 'hell'): RunState => ({
      ...createRun('DIFF6', 'standard', diff),
      phase: 'cashOut',
      ante,
      blindIndex: 2,
      handsLeft: 0,
      money: 10,
      hand: [],
    });
    expect(reducer(at(5, 'normal'), { type: 'cashOut' }).phase).toBe('won');
    expect(reducer(at(5, 'hell'), { type: 'cashOut' }).phase).toBe('shop');
    expect(reducer(at(8, 'hell'), { type: 'cashOut' }).phase).toBe('won');
  });

  it('newRun 可以换难度（底注数与牌组一起重置）', () => {
    const s = reducer(createRun('DIFF7'), { type: 'newRun', deckId: 'slim', difficulty: 'hell' });
    expect(s.difficulty).toBe('hell');
    expect(s.maxAnte).toBe(8);
    expect(s.deckId).toBe('slim');
    expect(s.deck).toHaveLength(32);
  });
});

describe('P5 难度与存档', () => {
  it('难度跨存档保留', () => {
    const s = createRun('DIFF8', 'redblack', 'challenge');
    const restored = migrateSave(JSON.parse(JSON.stringify(s))) as RunState;
    expect(restored.difficulty).toBe('challenge');
    expect(restored.maxAnte).toBe(6);
    expect(restored.deckId).toBe('redblack');
  });

  it('旧存档没有难度 → 普通 / 5 个底注', () => {
    const raw = JSON.parse(JSON.stringify(createRun('DIFF9'))) as Record<string, unknown>;
    delete raw.difficulty;
    delete raw.maxAnte;
    const m = migrateSave(raw);
    expect(m?.difficulty).toBe('normal');
    expect(m?.maxAnte).toBe(5);
  });

  it('难度非法 → 回退普通；maxAnte 以难度为准（不信任存档副本）', () => {
    const raw = JSON.parse(JSON.stringify(createRun('DIFF10'))) as Record<string, unknown>;
    raw.difficulty = 'nightmare';
    raw.maxAnte = 99;
    const m = migrateSave(raw);
    expect(m?.difficulty).toBe('normal');
    expect(m?.maxAnte).toBe(5);
  });
});

describe('P5 局面板', () => {
  const html = renderToString(<NewRunPanel onStart={() => {}} onClose={() => {}} />);

  it('四档难度都列出来并写明底注数', () => {
    expect(html).toContain('轻松');
    expect(html).toContain('普通');
    expect(html).toContain('挑战');
    expect(html).toContain('地狱');
    expect(html).toContain('8 底注');
    expect(html).toContain('开始');
  });

  it('默认选中普通，摘要行写明底注数与起始牌数', () => {
    expect(html).toContain('标准牌组 · 普通 · 5 个底注 · 起始 52 张牌');
  });
});
