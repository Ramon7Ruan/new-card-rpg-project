import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { card } from '../core/cards';
import { createDeck } from '../core/cards';
import { createRun, reducer } from '../core/run';
import type { RunState } from '../core/types';
import App from '../ui/App';
import { CardView } from '../ui/CardView';
import { DeckPanel } from '../ui/DeckPanel';

function playing(seed = 'DECKUI'): RunState {
  return reducer(createRun(seed), { type: 'selectBlind' });
}

describe('P2-3 牌堆面板', () => {
  it('列出全部牌，按花色分组', () => {
    const html = renderToString(<DeckPanel cards={createDeck()} onClose={() => {}} />);
    // 一张牌一个花色符号（card-pip），用它数牌数
    const count = (html.match(/class="card-pip"/g) ?? []).length;
    expect(count).toBe(52);
    expect(html).toContain('共 52 张');
    expect(html).toContain('♠');
    expect(html).toContain('♣');
  });

  it('统计增强与蜡封张数', () => {
    const cards = [card('s', 14, 'bonus', 'red'), card('h', 9, 'steel'), card('d', 2)];
    const html = renderToString(<DeckPanel cards={cards} onClose={() => {}} />);
    expect(html).toContain('增强 2 张');
    expect(html).toContain('蜡封 1 张');
  });

  it('选目标态：显示已选数量，没选够时确认按钮禁用', () => {
    const cards = [card('s', 14), card('h', 9)];
    const html = renderToString(
      <DeckPanel
        cards={cards}
        select={{
          count: 1,
          picked: [],
          onToggle: () => {},
          onConfirm: () => {},
          onCancel: () => {},
        }}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('选择 1 张牌');
    expect(html).toContain('已选 0/1');
    // 精确检查「确认」这一个按钮上带着 disabled，而不是页面里随便有个 disabled
    const at = html.indexOf('确认');
    const tag = html.slice(html.lastIndexOf('<button', at), at);
    expect(tag).toContain('disabled');
  });

  it('选够之后确认按钮可用', () => {
    const cards = [card('s', 14), card('h', 9)];
    const html = renderToString(
      <DeckPanel
        cards={cards}
        select={{
          count: 1,
          picked: ['spade-14'],
          onToggle: () => {},
          onConfirm: () => {},
          onCancel: () => {},
        }}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('已选 1/1');
    expect(html).toContain('可以确认');
    const at = html.indexOf('确认');
    const tag = html.slice(html.lastIndexOf('<button', at), at);
    expect(tag).not.toContain('disabled');
  });
});

describe('P2-3 卡面标出增强与蜡封', () => {
  it('增强显示短标签，蜡封显示内描边样式', () => {
    const html = renderToString(<CardView card={card('s', 14, 'bonus', 'red')} />);
    expect(html).toContain('card-enh is-bonus');
    expect(html).toContain('附加');
    expect(html).toContain('seal-red');
  });

  it('普通牌不出现任何增强标记', () => {
    const html = renderToString(<CardView card={card('s', 14)} />);
    expect(html).not.toContain('card-enh');
    expect(html).not.toContain('seal-');
  });
});

describe('P2-3 顶栏入口', () => {
  it('显示当前牌堆张数', () => {
    const s = playing();
    const total = s.hand.length + s.deck.length + s.discardPile.length;
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain(`牌堆 ${total}`);
  });

  it('手牌里的增强牌在牌桌上就有标记', () => {
    const s = playing('DECKHAND');
    const marked: RunState = {
      ...s,
      hand: s.hand.map((c, i) => (i === 0 ? { ...c, enhancement: 'glass' } : c)),
    };
    const html = renderToString(<App initialState={marked} />);
    expect(html).toContain('裂隙');
  });

  it('持有符咒时显示在铭文槽里', () => {
    const s: RunState = {
      ...playing('CHARMSLOT'),
      consumables: [{ uid: 'c0', defId: 'charm-bonus' }],
    };
    const html = renderToString(<App initialState={s} />);
    expect(html).toContain('烈焰符');
    expect(html).toContain('使用');
  });
});
