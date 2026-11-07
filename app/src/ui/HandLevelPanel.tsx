import { ALL_HAND_TYPES, baseFor, HAND_LABEL } from '../core/hands';
import type { HandType } from '../core/types';

/**
 * 牌型等级面板。数值全部来自 baseFor()——与计分走同一个函数，
 * 因此面板上写的「当前 筹码 × 倍率」就是这一手真打出去时的基础值。
 */
export function HandLevelPanel({
  levels,
  current,
  onClose,
}: {
  levels: Record<HandType, number>;
  /** 当前选中的牌型（没有选牌时为 null） */
  current: HandType | null;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel panel-levels" onClick={(e) => e.stopPropagation()}>
        <h2>牌型等级</h2>
        <p className="sub">等级来自铭文；每次升级按固定增量提高该牌型的基础值。</p>

        <div className="level-table">
          <div className="level-row is-head">
            <span className="lv-name">牌型</span>
            <span className="lv-num">等级</span>
            <span className="lv-val">基础 筹码 × 倍率</span>
            <span className="lv-next">再升一级</span>
          </div>
          {ALL_HAND_TYPES.map((t) => {
            const lv = levels[t] ?? 1;
            const now = baseFor(t, lv);
            const next = baseFor(t, lv + 1);
            return (
              <div key={t} className={`level-row ${current === t ? 'is-current' : ''}`}>
                <span className="lv-name">
                  {HAND_LABEL[t]}
                  {current === t && <em className="lv-now">当前</em>}
                </span>
                <span className={`lv-num ${lv > 1 ? 'is-up' : ''}`}>{`Lv.${lv}`}</span>
                <span className="lv-val">
                  <b className="chips">{now.chips}</b>
                  <i>×</i>
                  <b className="mult">{now.mult}</b>
                </span>
                <span className="lv-next">{`+${next.chips - now.chips} / +${next.mult - now.mult}`}</span>
              </div>
            );
          })}
        </div>

        <div className="panel-actions">
          <span className="owned-hint">「再升一级」= 筹码增量 / 倍率增量</span>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
