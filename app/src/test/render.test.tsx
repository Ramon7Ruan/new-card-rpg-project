import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createRun, reducer } from '../core/run';
import App from '../ui/App';

describe('渲染冒烟', () => {
  it('盲注选择页能渲染三个盲注与目标分数', () => {
    const html = renderToString(<App initialState={createRun('SMOKE')} />);
    expect(html).toContain('小盲注');
    expect(html).toContain('大盲注');
    expect(html).toContain('Boss 盲注');
    expect(html).toContain('300');
    expect(html).toContain('450');
    expect(html).toContain('600');
  });

  it('出牌界面能渲染手牌与操作按钮', () => {
    let s = createRun('SMOKE');
    s = reducer(s, { type: 'selectBlind' });
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('出牌');
    expect(html).toContain('弃牌');
    expect(html).toContain('目标');
    // 8 张手牌各渲染一个 .card
    const cardCount = (html.match(/class="card[^"]*"/g) ?? []).length;
    expect(cardCount).toBeGreaterThanOrEqual(8);
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
    s = { ...s, lastScore: { handType: 'flush', chips: 200, mult: 9, score: 1800, events: [], scoringCardIds: [] } };
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
    expect(html).toContain('继续下一盲注');
  });
});
