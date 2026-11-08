import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { describeBlindRule, rollBoss } from '../core/blinds';
import { createRun, reducer } from '../core/run';
import type { RunState } from '../core/types';
import App from '../ui/App';

/** 直接进入指定 Boss 的牌桌 */
function bossState(seed: string, bossId: string, ante = 1): RunState {
  let s = createRun(seed);
  s = { ...s, ante, blindIndex: 2 };
  return reducer(s, { type: 'selectBlind', bossId });
}

describe('渲染冒烟', () => {
  it('盲注选择页能渲染三个盲注与目标分数', () => {
    const s = createRun('SMOKE');
    const boss = rollBoss(s.seed, s.ante);
    const html = renderToString(<App initialState={s} />);

    expect(html).toContain('小盲注');
    expect(html).toContain('大盲注');
    expect(html).toContain('Boss 盲注');
    expect(html).toContain('300');
    expect(html).toContain('450');
    // Boss 位显示的是乘过倍率之后的实际目标
    expect(html).toContain(String(Math.round(600 * (boss.rule.targetMultiplier ?? 1))));
  });

  it('盲注选择页直接写清 Boss 名与效果，不用点进去才知道', () => {
    const s = createRun('SHOWBOSS');
    const boss = rollBoss(s.seed, s.ante);
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain(boss.boss.name);
    expect(html).toContain(describeBlindRule(boss.rule)[0]);
  });

  it('出牌界面能渲染手牌与操作按钮', () => {
    let s = createRun('SMOKE');
    s = reducer(s, { type: 'selectBlind' });
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('出牌');
    expect(html).toContain('弃牌');
    expect(html).toContain('目标');
    const cardCount = (html.match(/class="card[^"]*"/g) ?? []).length;
    expect(cardCount).toBeGreaterThanOrEqual(8);
  });

  it('Boss 牌桌顶部显示当前生效的规则', () => {
    const s = bossState('RULEBAR', 'rampart');
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('铁壁');
    expect(html).toContain('目标分数 ×1.5');
    expect(html).toContain('rule-bar');
  });

  it('铁壁把目标提高到 ×1.5', () => {
    const s = bossState('RAMPART', 'rampart');
    expect(s.target).toBe(900);
    expect(s.phase).toBe('playing');
  });

  it('铁律：未选满 5 张时出牌按钮禁用，并给出提示', () => {
    const s = bossState('DECREE', 'decree');
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('必须出满 5 张');
    expect(html).toMatch(/<button class="btn btn-primary" disabled=""/);
  });

  it('干涸：进入盲注后弃牌次数为 0，界面写明不能弃牌', () => {
    const s = bossState('DROUGHT', 'drought');
    expect(s.discardsLeft).toBe(0);
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('本回合不能弃牌');
  });

  it('束带：手牌上限变 7，只发 7 张', () => {
    const s = bossState('GIRDLE', 'girdle');
    expect(s.handSize).toBe(7);
    expect(s.hand).toHaveLength(7);
  });

  it('选牌后立即显示牌型与预计得分', () => {
    let s = createRun('PREVIEW');
    s = reducer(s, { type: 'selectBlind' });
    s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('预计本次得分');
    expect(html).toContain('高牌');
  });

  it('未选牌时得分区留空，不显示上一手结果', () => {
    let s = createRun('PREVIEW');
    s = reducer(s, { type: 'selectBlind' });
    s = {
      ...s,
      lastScore: {
        handType: 'flush',
        chips: 200,
        mult: 9,
        score: 1800,
        money: 0,
        events: [],
        scoringCardIds: [],
        debuffedCardIds: [],
      },
    };
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('未选牌');
    expect(html).not.toContain('1800');
  });

  it('商店页能渲染商品与重摇按钮', () => {
    let s = createRun('SMOKE');
    s = reducer(s, { type: 'selectBlind' });
    s = { ...s, target: 1, money: 50 };
    s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
    s = reducer(s, { type: 'playHand' });
    s = reducer(s, { type: 'cashOut' });
    expect(s.phase).toBe('shop');
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('商店');
    expect(html).toContain('重摇');
    expect(html).toContain('下一盲注');
  });
});

// ── P1 界面：消耗品槽、等级、卖出区 ─────────────────────────────

function shopState(over: Partial<RunState> = {}): RunState {
  return {
    ...createRun('SHOPSMOKE'),
    phase: 'shop',
    money: 30,
    shop: {
      jokers: [{ defId: 'fission', cost: 6, sold: false }],
      consumables: [{ defId: 'inscribe-pair', cost: 3, sold: false }],
      voucher: null,
      packs: [],
      rerollCost: 5,
      rerolls: 0,
    },
    ...over,
  };
}

describe('消耗品与卖出界面', () => {
  it('持有铭文时牌桌上出现消耗品槽与使用按钮', () => {
    let s = reducer(createRun('CSMOKE'), { type: 'selectBlind' });
    s = { ...s, consumables: [{ uid: 'c0', defId: 'inscribe-flush' }] };
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('同花铭文');
    expect(html).toContain('consumable-row');
    expect(html).toContain('使用');
  });

  it('没有铭文时不占位（牌桌保持紧凑）', () => {
    const s = reducer(createRun('CSMOKE'), { type: 'selectBlind' });
    const html = renderToString(<App initialState={s} />);
    expect(html).not.toContain('consumable-row');
  });

  it('选牌后显示牌型等级（只在 >1 时出现）', () => {
    let s = reducer(createRun('LVSMOKE'), { type: 'selectBlind' });
    s = reducer(s, { type: 'toggleCard', cardId: s.hand[0].id });
    expect(renderToString(<App initialState={s} />)).not.toContain('Lv.');

    const up = { ...s, handLevels: { ...s.handLevels, highCard: 3 } };
    const html = renderToString(<App initialState={up} />);
    expect(html).toContain('Lv.3');
  });

  it('商店页两个货架分区展示，并写明类型', () => {
    const html = renderToString(<App initialState={shopState()} />);
    expect(html).toContain('对子铭文');
    expect(html).toContain('裂变');
    expect(html).toContain('kind-tag');
    expect(html).toContain('星球与符咒');
    expect(html).toContain('消耗品 0/2');
  });

  it('商店页有卖出区，价格写在实际按钮上', () => {
    const s = shopState({
      jokers: [{ uid: 'j0', defId: 'fission' }],
      consumables: [{ uid: 'c0', defId: 'inscribe-pair' }],
    });
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('owned');
    expect(html).toContain('卖出 $3'); // fission 原价 6 → 3
    expect(html).toContain('卖出 $1'); // 铭文原价 3 → 1
  });

  it('空槽时商店显示「还没有任何牌」占位而不是空白', () => {
    const html = renderToString(<App initialState={shopState()} />);
    expect(html).toContain('还没有任何牌');
  });

  it('小丑槽满时购买按钮禁用并提示槽位已满', () => {
    const s = shopState({
      jokers: ['jester', 'twin', 'prism', 'bronze', 'stone'].map((defId, i) => ({
        uid: `j${i}`,
        defId,
      })),
    });
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('槽位已满');
  });

  it('商店页有优惠券货位，说明是永久生效', () => {
    const s = shopState({
      shop: {
        jokers: [],
        consumables: [],
        voucher: { defId: 'bigger-joker', cost: 10, sold: false },
        packs: [],
        rerollCost: 5,
        rerolls: 0,
      },
    });
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('优惠券');
    expect(html).toContain('小丑背包');
    expect(html).toContain('永久生效');
  });

  it('已购优惠券列在商店里，且槽位数量跟着变', () => {
    const s = shopState({ vouchers: ['bigger-joker'] });
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('已生效：小丑背包');
    expect(html).toContain('小丑 0/6');
  });

  it('商店页有补充包货架，槽满时按钮写「槽位已满」', () => {
    const full = shopState({
      jokers: ['jester', 'twin', 'prism', 'bronze', 'stone'].map((defId, i) => ({
        uid: `j${i}`,
        defId,
      })),
    });
    const s = { ...full, shop: { ...full.shop!, packs: [{ defId: 'pack-joker', cost: 5, sold: false }] } };
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('补充包');
    expect(html).toContain('小丑包');
    expect(html).toContain('槽位已满');
  });

  it('开包面板列出候选并给出跳过入口', () => {
    const s = shopState({
      pack: {
        packId: 'pack-joker',
        choices: [
          { kind: 'joker', defId: 'fission' },
          { kind: 'joker', defId: 'jester' },
          { kind: 'joker', defId: 'twin' },
        ],
      },
    });
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('小丑包');
    expect(html).toContain('裂变');
    expect(html).toContain('选 1 张');
    expect(html).toContain('跳过');
  });

  it('盲注选择页有跳过按钮，Boss 位写明不能跳过', () => {
    const s = createRun('SKIPUI');
    expect(renderToString(<App initialState={s} />)).toContain('跳过 · 得标签');

    const boss = { ...s, blindIndex: 2 };
    const html = renderToString(<App initialState={boss} />);
    expect(html).toContain('Boss 盲注不能跳过');
  });

  it('已获得的标签在选择页列出来', () => {
    const s = { ...createRun('SKIPUI2'), tags: ['tag-cash', 'tag-level'] };
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('现钱袋');
    expect(html).toContain('手记残页');
  });

  it('有免费重摇时按钮直接写「免费」', () => {
    const html = renderToString(<App initialState={shopState({ freeRerolls: 1 })} />);
    expect(html).toContain('重摇 · 免费');
  });
});
