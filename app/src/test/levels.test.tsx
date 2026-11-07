import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ALL_HAND_TYPES, baseFor, HAND_LABEL, HAND_LEVEL_GAIN, initialHandLevels } from '../core/hands';
import { createRun } from '../core/run';
import App from '../ui/App';
import { HandLevelPanel } from '../ui/HandLevelPanel';

describe('牌型等级面板', () => {
  it('12 种牌型全部列出，数值取自 baseFor', () => {
    const levels = { ...initialHandLevels(), pair: 3 };
    const html = renderToString(<HandLevelPanel levels={levels} current={null} onClose={() => {}} />);

    for (const t of ALL_HAND_TYPES) expect(html).toContain(HAND_LABEL[t]);

    // 对子 3 级：10 + 18×2 = 46 筹码，2 + 1×2 = 4 倍率
    const now = baseFor('pair', 3);
    expect(now).toEqual({ chips: 46, mult: 4 });
    expect(html).toContain(`<b class="chips">${now.chips}</b>`);
    expect(html).toContain(`<b class="mult">${now.mult}</b>`);
    expect(html).toContain(`Lv.${3}`);
    expect(html).toContain(`+${HAND_LEVEL_GAIN.pair.chips} / +${HAND_LEVEL_GAIN.pair.mult}`);
  });

  it('只有升过级的牌型标出 Lv.N，其余都是 Lv.1', () => {
    const levels = { ...initialHandLevels(), flush: 2 };
    const html = renderToString(<HandLevelPanel levels={levels} current={null} onClose={() => {}} />);
    expect((html.match(/Lv\.1/g) ?? []).length).toBe(ALL_HAND_TYPES.length - 1);
    expect(html).toContain('Lv.2');
  });

  it('标出当前这一手牌型', () => {
    const html = renderToString(
      <HandLevelPanel levels={initialHandLevels()} current="twoPair" onClose={() => {}} />,
    );
    expect(html).toContain('is-current');
    expect(html).toContain('当前');
  });

  it('顶栏有入口按钮', () => {
    const html = renderToString(<App initialState={createRun('LEVELBTN')} />);
    expect(html).toContain('牌型等级');
  });
});
