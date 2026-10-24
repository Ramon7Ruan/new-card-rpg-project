import { useEffect, useMemo, useReducer, useState } from 'react';
import { BLIND_NAMES, MAX_ANTE, rewardFor, targetFor } from '../core/blinds';
import { HAND_LABEL } from '../core/hands';
import { getJoker, MAX_JOKERS } from '../core/jokers';
import { clearRun, loadRun, saveRun } from '../core/persist';
import { createRun, reducer } from '../core/run';
import { scoreHand } from '../core/scoring';
import type { Card, RunState, ScoreResult } from '../core/types';
import { CardView } from './CardView';
import { JokerView } from './JokerView';

interface AnimState {
  result: ScoreResult;
  played: Card[];
  step: number;
}

const STEP_MS = 250;
const HOLD_MS = 700;

export default function App({ initialState }: { initialState?: RunState } = {}) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState ?? loadRun() ?? createRun());
  const [anim, setAnim] = useState<AnimState | null>(null);

  useEffect(() => {
    saveRun(state);
  }, [state]);

  useEffect(() => {
    if (!anim) return;
    const lastIndex = anim.result.events.length - 1;

    if (anim.step < lastIndex) {
      const t = window.setTimeout(() => {
        setAnim((a) => (a ? { ...a, step: a.step + 1 } : a));
      }, STEP_MS);
      return () => window.clearTimeout(t);
    }

    const t = window.setTimeout(() => {
      dispatch({ type: 'playHand' });
      setAnim(null);
    }, HOLD_MS);
    return () => window.clearTimeout(t);
  }, [anim]);

  const busy = anim !== null;
  const selectedCards = state.hand.filter((c) => state.selected.includes(c.id));

  /**
   * 选牌即算分：与出牌走同一个 scoreHand，因此预览值与真正结算值必然一致。
   * 只在 playing 阶段且已选牌时计算。
   */
  const preview = useMemo<ScoreResult | null>(() => {
    if (state.phase !== 'playing' || state.selected.length === 0) return null;
    const played = state.hand.filter((c) => state.selected.includes(c.id));
    if (played.length === 0) return null;
    return scoreHand({
      played,
      jokers: state.jokers,
      handLevels: state.handLevels,
      money: state.money,
      handsLeft: state.handsLeft,
      discardsUsed: state.discardsUsed,
      ante: state.ante,
    });
  }, [state]);

  function handlePlay() {
    if (state.phase !== 'playing' || busy) return;
    if (selectedCards.length === 0 || selectedCards.length > 5) return;

    const result = scoreHand({
      played: selectedCards,
      jokers: state.jokers,
      handLevels: state.handLevels,
      money: state.money,
      handsLeft: state.handsLeft,
      discardsUsed: state.discardsUsed,
      ante: state.ante,
    });
    setAnim({ result, played: selectedCards, step: 0 });
  }

  function handleNewRun() {
    clearRun();
    setAnim(null);
    dispatch({ type: 'newRun' });
  }

  const ev = anim ? anim.result.events[Math.min(anim.step, anim.result.events.length - 1)] : null;

  let chips = 0;
  let mult = 0;
  let total = 0;
  let handLabel = '';
  let stepLabel = '';
  let boardMode: 'idle' | 'anim' | 'preview' = 'idle';

  if (anim && ev) {
    // 播放中：以 trace 的当前事件为准
    chips = ev.chipsAfter;
    mult = ev.multAfter;
    handLabel = HAND_LABEL[anim.result.handType];
    stepLabel = ev.label;
    boardMode = 'anim';
    if (anim.step === anim.result.events.length - 1) total = anim.result.score;
  } else if (preview) {
    // 选牌中：直接显示这一手的最终结果，不再播放
    chips = preview.chips;
    mult = preview.mult;
    total = preview.score;
    handLabel = HAND_LABEL[preview.handType];
    stepLabel = '预计本次得分';
    boardMode = 'preview';
  }

  const progress = Math.min(100, Math.round((state.roundScore / Math.max(state.target, 1)) * 100));
  const progressWithPreview = Math.min(
    100,
    Math.round(((state.roundScore + (preview?.score ?? 0)) / Math.max(state.target, 1)) * 100),
  );
  const remaining = Math.max(state.target - state.roundScore, 0);
  const countedIds = preview ? new Set(preview.scoringCardIds) : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="stack">
          <span className="label">底注</span>
          <span className="value">
            {state.ante} / {MAX_ANTE}
          </span>
        </div>
        <div className="stack">
          <span className="label">盲注</span>
          <span className="value">{BLIND_NAMES[state.blindIndex] ?? '—'}</span>
        </div>
        <div className="stack">
          <span className="label">本局得分 / 目标</span>
          <span className="value">
            {state.roundScore} / {state.target}
          </span>
        </div>
        <div className="spacer" />
        <div className="stack" style={{ alignItems: 'flex-end' }}>
          <span className="label">资金</span>
          <span className="money">${state.money}</span>
        </div>
        <button className="ghost-btn" onClick={handleNewRun}>
          重开
        </button>
      </header>

      <section className="joker-row">
        {Array.from({ length: MAX_JOKERS }).map((_, i) => (
          <JokerView
            key={state.jokers[i]?.uid ?? `empty-${i}`}
            def={state.jokers[i] ? getJoker(state.jokers[i].defId) : undefined}
          />
        ))}
      </section>

      {state.phase === 'blindSelect' ? (
        <div className="table-area">
          <div className="round-head">
            <div className="target">选择本回合的盲注</div>
            <div className="target">
              第 <b>{state.ante}</b> / {MAX_ANTE} 底注
            </div>
            <div className="spacer" style={{ flex: 1 }} />
            <span className="seed">SEED {state.seed}</span>
          </div>
          <div className="blind-list">
            {[0, 1, 2].map((i) => {
              const isCurrent = i === state.blindIndex;
              const isDone = i < state.blindIndex;
              return (
                <button
                  key={i}
                  className={`blind-card ${isCurrent ? 'is-current' : ''} ${isDone ? 'is-done' : ''}`}
                  disabled={!isCurrent}
                  onClick={() => dispatch({ type: 'selectBlind' })}
                >
                  <div>
                    <div className="name">{BLIND_NAMES[i]}</div>
                    <div className="tag">
                      {isDone ? '已通过' : i === 2 ? 'Boss 位 · M0 无特殊效果' : '待挑战'}
                    </div>
                  </div>
                  <span className="req">{targetFor(state.ante, i)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="table-area">
          <div className="round-head">
            <div className="target">
              目标 <b>{state.target}</b>
            </div>
            <div className="target">
              已得 <b>{state.roundScore}</b>
            </div>
            <div className="target">
              还需 <b>{remaining}</b>
            </div>
            <div className="spacer" style={{ flex: 1 }} />
            <span className="seed">SEED {state.seed}</span>
          </div>
          <div className="progress">
            {preview && progressWithPreview > progress && (
              <i className="ghost" style={{ width: `${progressWithPreview}%` }} />
            )}
            <i style={{ width: `${progress}%` }} />
          </div>

          <div className="played-area">
            {anim ? (
              anim.played.map((c) => (
                <CardView
                  key={c.id}
                  card={c}
                  small
                  scoring={anim.result.scoringCardIds.includes(c.id)}
                  disabled
                />
              ))
            ) : (
              <span className="hint">
                {state.phase === 'playing' ? '点选手牌后出牌' : ''}
              </span>
            )}
          </div>

          <div className={`score-board ${boardMode}`}>
            <div className="score-hand">{handLabel || '未选牌'}</div>
            <div className="score-row">
              <span className="num chips">{boardMode === 'idle' ? '—' : chips}</span>
              <span className="times">×</span>
              <span className="num mult">{boardMode === 'idle' ? '—' : mult}</span>
            </div>
            <div className="score-step">{stepLabel}</div>
            <div className="score-total">
              {boardMode === 'idle'
                ? '选中的牌会计入得分'
                : boardMode === 'preview'
                  ? `= ${total}`
                  : total > 0
                    ? `= ${total}`
                    : ''}
            </div>
          </div>
        </div>
      )}

      {state.phase === 'playing' && (
        <section className="hand-row">
          {state.hand.map((c) => (
            <CardView
              key={c.id}
              card={c}
              selected={state.selected.includes(c.id)}
              counted={!!countedIds?.has(c.id)}
              disabled={busy}
              onClick={() => dispatch({ type: 'toggleCard', cardId: c.id })}
            />
          ))}
        </section>
      )}

      {state.phase === 'playing' && (
        <footer className="actions">
          <button
            className="btn btn-primary"
            disabled={busy || state.selected.length === 0}
            onClick={handlePlay}
          >
            出牌
          </button>
          <button
            className="btn"
            disabled={busy || state.discardsLeft === 0 || state.selected.length === 0}
            onClick={() => dispatch({ type: 'discard' })}
          >
            弃牌
          </button>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="counter">
            出牌 <b>{state.handsLeft}</b> / {state.handsLeft}
          </span>
          <span className="counter">
            弃牌 <b>{state.discardsLeft}</b>
          </span>
          <span className="counter">
            已选 <b>{state.selected.length}</b>/5
          </span>
        </footer>
      )}

      {state.phase === 'cashOut' && <CashOutPanel state={state} onConfirm={() => dispatch({ type: 'cashOut' })} />}
      {state.phase === 'shop' && state.shop && (
        <ShopPanel state={state} onBuy={(i) => dispatch({ type: 'buyJoker', index: i })} onReroll={() => dispatch({ type: 'reroll' })} onLeave={() => dispatch({ type: 'leaveShop' })} />
      )}
      {(state.phase === 'won' || state.phase === 'lost') && (
        <div className="overlay">
          <div className="panel">
            <h2>{state.phase === 'won' ? '通关' : '失败'}</h2>
            <p className="sub">
              {state.phase === 'won'
                ? `打完 ${MAX_ANTE} 个底注、共 ${MAX_ANTE * 3} 个盲注，最终资金 $${state.money}。`
                : `出牌次数用尽，得分 ${state.roundScore} / ${state.target}。`}
            </p>
            <div className="ledger">
              <div className="row">
                <span>小丑牌</span>
                <b>{state.jokers.length} 张</b>
              </div>
              <div className="row">
                <span>种子</span>
                <b>{state.seed}</b>
              </div>
            </div>
            <div className="panel-actions">
              <div className="spacer" />
              <button className="btn btn-primary" onClick={handleNewRun}>
                再来一局
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CashOutPanel({ state, onConfirm }: { state: RunState; onConfirm: () => void }) {
  const reward = rewardFor(state.blindIndex);
  const bonus = state.handsLeft;
  const interest = Math.min(Math.floor(state.money / 5), 5);
  const jokerMoney = state.jokers.reduce((sum, inst) => {
    const def = getJoker(inst.defId);
    return sum + (def?.onRoundEnd ? def.onRoundEnd({ money: state.money, ante: state.ante }) : 0);
  }, 0);
  const total = state.money + reward + bonus + interest + jokerMoney;

  return (
    <div className="overlay">
      <div className="panel">
        <h2>击败「{BLIND_NAMES[state.blindIndex]}」</h2>
        <p className="sub">结算收入</p>
        <div className="ledger">
          <div className="row">
            <span>盲注奖励</span>
            <b>+${reward}</b>
          </div>
          <div className="row">
            <span>剩余出牌 × $1</span>
            <b>+${bonus}</b>
          </div>
          <div className="row">
            <span>利息（每 $5 得 $1，上限 $5）</span>
            <b>+${interest}</b>
          </div>
          {jokerMoney > 0 && (
            <div className="row">
              <span>小丑牌收益</span>
              <b>+${jokerMoney}</b>
            </div>
          )}
          <div className="row total">
            <span>现有资金</span>
            <b>${total}</b>
          </div>
        </div>
        <div className="panel-actions">
          <div className="spacer" />
          <button className="btn btn-primary" onClick={onConfirm}>
            收款
          </button>
        </div>
      </div>
    </div>
  );
}

function ShopPanel({
  state,
  onBuy,
  onReroll,
  onLeave,
}: {
  state: RunState;
  onBuy: (index: number) => void;
  onReroll: () => void;
  onLeave: () => void;
}) {
  const shop = state.shop;
  if (!shop) return null;

  return (
    <div className="overlay">
      <div className="panel">
        <h2>商店</h2>
        <p className="sub">
          持有 ${state.money} · 小丑槽位 {state.jokers.length}/{MAX_JOKERS}
        </p>
        <div className="shop-grid">
          {shop.offers.map((o, i) => {
            const def = getJoker(o.defId);
            if (!def) return null;
            const full = state.jokers.length >= MAX_JOKERS;
            const poor = state.money < o.cost;
            const disabled = o.sold || full || poor;
            return (
              <div key={`${o.defId}-${i}`} className={`shop-item ${o.sold ? 'is-sold' : ''}`}>
                <div className="title">{def.name}</div>
                <div className="desc">{def.desc}</div>
                <div className="buy">
                  <span>${o.cost}</span>
                  <button className="btn" disabled={disabled} onClick={() => onBuy(i)}>
                    {o.sold ? '已售出' : full ? '槽位已满' : poor ? '钱不够' : '购买'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="panel-actions">
          <button className="btn" disabled={state.money < shop.rerollCost} onClick={onReroll}>
            重摇 ${shop.rerollCost}
          </button>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={onLeave}>
            继续下一盲注
          </button>
        </div>
      </div>
    </div>
  );
}
