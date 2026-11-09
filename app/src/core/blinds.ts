import { SUITS, SUIT_SYMBOL } from './cards';
import { makeRng } from './rng';
import type { BlindRule } from './types';

export const BLIND_NAMES = ['小盲注', '大盲注', 'Boss 盲注'] as const;
export const BLIND_REWARDS = [3, 4, 5] as const;

/**
 * 每个底注 3 个盲注，第三个是 Boss 位。
 * 加底注只需在此追加一行，状态机不需要改。
 *
 * 3 个底注（P4）：目标从 300 缓升到 3600，末位/首位 = 12×。
 * 原验收写的是「第 6 个盲注不超过第 1 个的 6 倍」，那是 2 底注时代的约束；
 * 扩到 9 个盲注后按同一思路重新表述为**每底注涨幅 ≤ 2.7×**，见 balance.test.ts。
 */
export const ANTE_TARGETS: number[][] = [
  [300, 450, 600],
  [800, 1200, 1600],
  [2000, 2800, 3600],
];

/** 一局要打多少个底注 */
export const MAX_ANTE = ANTE_TARGETS.length;

export function targetFor(ante: number, blindIndex: number): number {
  const row = ANTE_TARGETS[Math.min(Math.max(ante - 1, 0), ANTE_TARGETS.length - 1)];
  return row[Math.min(Math.max(blindIndex, 0), 2)];
}

export function rewardFor(blindIndex: number): number {
  return BLIND_REWARDS[Math.min(Math.max(blindIndex, 0), 2)];
}

// ─────────────────────────────────────────────
// Boss 盲注
// ─────────────────────────────────────────────

export interface BossDef {
  id: string;
  name: string;
  /** 规则模板 */
  rule: BlindRule;
  /** 该 Boss 还需要再随机一种花色（失色用） */
  randomSuit?: boolean;
}

/**
 * 6 个 Boss。名字与文案自拟，机制层面为通用玩法设计。
 * 全部用声明式规则表达，禁止写 apply(state) 函数——否则存档无法序列化。
 */
export const BOSSES: BossDef[] = [
  { id: 'rampart', name: '铁壁', rule: { targetMultiplier: 1.5 } },
  { id: 'drought', name: '干涸', rule: { forbidDiscards: true } },
  { id: 'girdle', name: '束带', rule: { handSizeDelta: -1 } },
  { id: 'decree', name: '铁律', rule: { requirePlayedCards: 5 } },
  { id: 'fade', name: '失色', rule: {}, randomSuit: true },
  { id: 'nameless', name: '无名', rule: { debuffFace: true } },
];

const BOSS_BY_ID = new Map(BOSSES.map((b) => [b.id, b]));

export function getBoss(id: string | null): BossDef | undefined {
  return id ? BOSS_BY_ID.get(id) : undefined;
}

/**
 * 按 (seed, ante) 确定性地抽本底注的 Boss 并解析规则。
 * 同 seed 同底注永远得到同一个 Boss 与同一种花色——刷新、读档都一致。
 */
export function rollBoss(seed: string, ante: number): { boss: BossDef; rule: BlindRule } {
  return resolveBoss(seed, ante);
}

/**
 * 同上，但允许显式指定 Boss（仅供测试与调试，正常流程不传）。
 * 指定后仍由 seed 决定花色，保证同一 seed 下结果稳定。
 */
export function resolveBoss(
  seed: string,
  ante: number,
  bossId?: string,
): { boss: BossDef; rule: BlindRule } {
  const rolled = pickBoss(seed, ante);
  if (!bossId || bossId === rolled.boss.id) return rolled;

  const forced = BOSS_BY_ID.get(bossId);
  if (!forced) return rolled;

  const rule: BlindRule = { ...forced.rule };
  if (forced.randomSuit) {
    const rnd = makeRng(seed, `boss:${ante}:suit`);
    rule.debuffSuit = SUITS[Math.floor(rnd() * SUITS.length)];
  }
  return { boss: forced, rule };
}

function pickBoss(seed: string, ante: number): { boss: BossDef; rule: BlindRule } {
  const rnd = makeRng(seed, `boss:${ante}`);
  const boss = BOSSES[Math.floor(rnd() * BOSSES.length)] ?? BOSSES[0];
  const rule: BlindRule = { ...boss.rule };
  if (boss.randomSuit) {
    rule.debuffSuit = SUITS[Math.floor(rnd() * SUITS.length)];
  }
  return { boss, rule };
}

/** 把规则翻译成人话，界面直接用。 */
export function describeBlindRule(rule: BlindRule | null): string[] {
  if (!rule) return [];
  const parts: string[] = [];
  if (rule.targetMultiplier && rule.targetMultiplier !== 1) {
    parts.push(`目标分数 ×${rule.targetMultiplier}`);
  }
  if (rule.forbidDiscards) parts.push('本回合不能弃牌');
  if (rule.handSizeDelta) {
    parts.push(`手牌上限 ${rule.handSizeDelta > 0 ? '+' : ''}${rule.handSizeDelta}`);
  }
  if (rule.requirePlayedCards) parts.push(`每手必须出满 ${rule.requirePlayedCards} 张`);
  if (rule.debuffSuit) parts.push(`花色 ${SUIT_SYMBOL[rule.debuffSuit]} 不计分`);
  if (rule.debuffFace) parts.push('J / Q / K 不计分');
  return parts;
}
