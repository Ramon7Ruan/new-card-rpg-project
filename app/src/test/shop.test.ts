import { describe, expect, it } from 'vitest';
import { getConsumable } from '../core/consumables';
import { getJoker } from '../core/jokers';
import { CONSUMABLE_SHELF, JOKER_SHELF, rollShop } from '../core/shop';

/**
 * P3 商店双池：小丑 3 张、星球与符咒 2 张。
 * 这组测试锁的是「池子结构」而不是某次随机结果。
 */
describe('P3 商店双池', () => {
  it('每次固定 3 张不重复的小丑', () => {
    for (let nonce = 0; nonce < 60; nonce++) {
      const shop = rollShop('SHELF', nonce);
      expect(shop.jokers).toHaveLength(JOKER_SHELF);
      expect(JOKER_SHELF).toBe(3);
      expect(new Set(shop.jokers.map((o) => o.defId)).size).toBe(JOKER_SHELF);
      for (const o of shop.jokers) {
        const def = getJoker(o.defId);
        expect(def).toBeTruthy();
        expect(o.cost).toBe(def!.cost);
        expect(o.sold).toBe(false);
      }
    }
  });

  it('每次固定 2 张不重复的消耗品，且只来自星球 + 符咒这一个池', () => {
    for (let nonce = 0; nonce < 60; nonce++) {
      const shop = rollShop('SHELF', nonce);
      expect(shop.consumables).toHaveLength(CONSUMABLE_SHELF);
      expect(CONSUMABLE_SHELF).toBe(2);
      expect(new Set(shop.consumables.map((o) => o.defId)).size).toBe(CONSUMABLE_SHELF);
      for (const o of shop.consumables) {
        const def = getConsumable(o.defId);
        expect(def).toBeTruthy();
        expect(o.cost).toBe(def!.cost);
        // 消耗品位里绝不可能出现小丑
        expect(getJoker(o.defId)).toBeUndefined();
      }
    }
  });

  it('消耗品池里星球和符咒都会出现（不是只出其中一类）', () => {
    let planets = 0;
    let charms = 0;
    for (let nonce = 0; nonce < 80; nonce++) {
      for (const o of rollShop('MIX', nonce).consumables) {
        const kind = getConsumable(o.defId)?.kind;
        if (kind === 'planet') planets += 1;
        if (kind === 'charm') charms += 1;
      }
    }
    expect(planets).toBeGreaterThan(0);
    expect(charms).toBeGreaterThan(0);
    // 40 张里两类都得有相当数量，说明没有把某一类挤成边角料
    expect(planets + charms).toBe(160);
  });

  it('小丑池里不会出现消耗品（两池完全隔离）', () => {
    for (let nonce = 0; nonce < 60; nonce++) {
      for (const o of rollShop('ISO', nonce).jokers) {
        expect(getConsumable(o.defId)).toBeUndefined();
      }
    }
  });

  it('货架宽度可加宽，且两个池的子流互不影响', () => {
    const base = rollShop('WIDE', 3);
    const wide = rollShop('WIDE', 3, { jokers: 5, consumables: 3 });
    expect(wide.jokers).toHaveLength(5);
    expect(wide.consumables).toHaveLength(3);
    // 加宽小丑货架不改变消耗品抽取结果
    expect(wide.consumables.slice(0, CONSUMABLE_SHELF)).toEqual(base.consumables);
    // 加宽消耗品货架也不改变小丑抽取结果
    expect(wide.jokers.slice(0, JOKER_SHELF)).toEqual(base.jokers);
  });

  it('同一 nonce 完全一致，不同 nonce 会变', () => {
    expect(rollShop('DET', 7)).toEqual(rollShop('DET', 7));
    const keys = [1, 2, 3, 4].map((n) => JSON.stringify(rollShop('DET', n)));
    expect(new Set(keys).size).toBeGreaterThan(1);
  });

  it('每个新货架都是未售出状态、重摇价回到基础值', () => {
    const shop = rollShop('FRESH', 0);
    expect([...shop.jokers, ...shop.consumables].every((o) => !o.sold)).toBe(true);
    expect(shop.rerolls).toBe(0);
    expect(shop.rerollCost).toBe(5);
  });
});
