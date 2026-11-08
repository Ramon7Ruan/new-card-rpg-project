import { CHARMS } from './charms';
import { PLANETS } from './consumables';
import { drawJokers, sample } from './pools';
import { makeRng, type Rng } from './rng';
import type { Card, Enhancement, PackChoice, PackKind, PackState, ShopOffer, Suit } from './types';

/**
 * 补充包（P3）：买下 → 开包 → 3 选 1，也可以整包跳过。
 *
 * 三条硬约定：
 * 1. 候选是**纯数据**（PackState 进存档），刷新页面不会把包弄丢。
 * 2. 槽位满时**买不了**（UI 禁用），而不是买完开包时才发现装不下——
 *    验收要求里明确写了「不能静默丢失」。
 * 3. 开出来的候选用独立 RNG 子流，重摇商店不会改变已开出包的内容。
 */

export interface PackDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  kind: PackKind;
}

export const PACK_CHOICES = 3;
export const PACKS_PER_SHOP = 2;

export const PACKS: PackDef[] = [
  {
    id: 'pack-joker',
    name: '小丑包',
    desc: `开 ${PACK_CHOICES} 张小丑，选 1 张`,
    cost: 5,
    kind: 'joker',
  },
  {
    id: 'pack-planet',
    name: '星球包',
    desc: `开 ${PACK_CHOICES} 张星球牌，选 1 张`,
    cost: 3,
    kind: 'planet',
  },
  {
    id: 'pack-charm',
    name: '符咒包',
    desc: `开 ${PACK_CHOICES} 张符咒，选 1 张`,
    cost: 3,
    kind: 'charm',
  },
  {
    id: 'pack-standard',
    name: '标准包',
    desc: `开 ${PACK_CHOICES} 张带增强的扑克牌，选 1 张进牌堆`,
    cost: 4,
    kind: 'standard',
  },
];

const BY_ID = new Map(PACKS.map((p) => [p.id, p]));

export function getPack(id: string): PackDef | undefined {
  return BY_ID.get(id);
}

const SUITS: Suit[] = ['spade', 'heart', 'diamond', 'club'];
const ENHANCEMENTS: Enhancement[] = ['bonus', 'mult', 'glass', 'steel', 'gold', 'wild'];

/**
 * 标准包的三张牌：花色 + 点数不重复，每张都带一个随机增强。
 * id 带 #pack 后缀，避免和牌堆里原本的同一张牌撞 id。
 */
function makeCards(rnd: Rng, n: number, seq: number): PackChoice[] {
  const used = new Set<string>();
  const out: PackChoice[] = [];
  let guard = 0;
  while (out.length < n && guard < 200) {
    guard += 1;
    const suit = SUITS[Math.floor(rnd() * SUITS.length)];
    const rank = 2 + Math.floor(rnd() * 13);
    const key = `${suit}-${rank}`;
    if (used.has(key)) continue;
    used.add(key);
    const enhancement = ENHANCEMENTS[Math.floor(rnd() * ENHANCEMENTS.length)];
    const card: Card = { id: `${key}#pack${seq}-${out.length}`, suit, rank, enhancement };
    out.push({ kind: 'card', card });
  }
  return out;
}

/** 商店里挂哪两个包：不重复、确定性 */
export function rollPacks(seed: string, nonce: number, count = PACKS_PER_SHOP): ShopOffer[] {
  const rnd = makeRng(seed, `packs:${nonce}`);
  return sample(rnd, PACKS, count).map((p) => ({ defId: p.id, cost: p.cost, sold: false }));
}

/**
 * 开包。nonceKey 由调用方拼（底注 / 盲注 / 重摇次数 / 货位），
 * 保证同一间商店里的两个包开出不同内容，而重摇前的旧包内容不会被改写。
 */
export function openPack(seed: string, nonceKey: string, def: PackDef, seq: number): PackState {
  const rnd = makeRng(seed, `pack:${nonceKey}`);

  if (def.kind === 'joker') {
    return {
      packId: def.id,
      choices: drawJokers(rnd, PACK_CHOICES).map((o) => ({ kind: 'joker' as const, defId: o.defId })),
    };
  }
  if (def.kind === 'planet') {
    return {
      packId: def.id,
      choices: sample(rnd, PLANETS, PACK_CHOICES).map((d) => ({
        kind: 'consumable' as const,
        defId: d.id,
      })),
    };
  }
  if (def.kind === 'charm') {
    return {
      packId: def.id,
      choices: sample(rnd, CHARMS, PACK_CHOICES).map((d) => ({
        kind: 'consumable' as const,
        defId: d.id,
      })),
    };
  }
  return { packId: def.id, choices: makeCards(rnd, PACK_CHOICES, seq) };
}

/** 这个包要占哪个槽；standard 不占槽（直接进牌堆） */
export function packSlot(packId: string): 'joker' | 'consumable' | null {
  const def = getPack(packId);
  if (!def) return null;
  if (def.kind === 'joker') return 'joker';
  if (def.kind === 'standard') return null;
  return 'consumable';
}
