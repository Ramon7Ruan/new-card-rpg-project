import { useEffect, useMemo, useReducer, useState } from 'react';
import type { Dispatch } from 'react';
import {
  BLIND_NAMES,
  describeBlindRule,
  getBoss,
  MAX_ANTE,
  rewardFor,
  rollBoss,
  targetFor,
} from '../core/blinds';
import { getConsumable, MAX_CONSUMABLES } from '../core/consumables';
import { HAND_LABEL } from '../core/hands';
import { getJoker, MAX_JOKERS } from '../core/jokers';
import { clearRun, loadRun, saveRun } from '../core/persist';
import { createRun, reducer, type Action } from '../core/run';
import { scoreHand } from '../core/scoring';
import { sellValue } from '../core/shop';
import type { Card, HandType, RunState, ScoreResult } from '../core/types';
import { CardView } from './CardView';
import { ConsumableView } from './ConsumableView';
import { DeckPanel } from './DeckPanel';
import { HandLevelPanel } from './HandLevelPanel';
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
  const [showLevels, setShowLevels] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  /** 正在等目标牌的符咒在消耗品槽里的下标；null = 没有待选目标的符咒 */
  const [pendingCharm, setPendingCharm] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

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
  /** 整副牌：手牌 + 牌堆 + 弃牌堆。牌堆面板与符咒选目标都用这一份 */
  const allCards = useMemo(
    () => [...state.hand, ...state.deck, ...state.discardPile],
    [state.hand, state.deck, state.discardPile],
  );

  /**
   * 选牌即算分：与出牌走同一个 scoreHand（同一份 Boss 规则），
   * 因此预览值与真正结算值必然一致。
   */
  const preview = useMemo<ScoreResult | null>(() => {
    if (state.phase !== 'playing' || state.selected.length === 0) return null;
    const played = state.hand.filter((c) => state.selected.includes(c.id));
    if (played.length === 0) return null;
    return scoreHand({
      played,
      held: state.hand.filter((c) => !state.selected.includes(c.id)),
      jokers: state.jokers,
      handLevels: state.handLevels,
      money: state.money,
      handsLeft: state.handsLeft,
      discardsUsed: state.discardsUsed,
      ante: state.ante,
      rule: state.bossRule,
    });
  }, [state]);

  /** 盲注选择页的 Boss 预览：与 selectBlind 用同一个解析函数，结果必然一致 */
  const bossPreview = useMemo(
    () => (state.phase === 'blindSelect' ? rollBoss(state.seed, state.ante) : null),
    [state.phase, state.seed, state.ante],
  );

  function handlePlay() {
    if (state.phase !== 'playing' || busy) return;
    if (selectedCards.length === 0 || selectedCards.length > 5) return;

    const result = scoreHand({
      played: selectedCards,
      held: state.hand.filter((c) => !state.selected.includes(c.id)),
      jokers: state.jokers,
      handLevels: state.handLevels,
      money: state.money,
      handsLeft: state.handsLeft,
      discardsUsed: state.discardsUsed,
      ante: state.ante,
      rule: state.bossRule,
    });
    setAnim({ result, played: selectedCards, step: 0 });
  }

  function handleNewRun() {
    clearRun();
    setAnim(null);
    setPendingCharm(null);
    setPicked([]);
    setDeckOpen(false);
    dispatch({ type: 'newRun' });
  }

  /**
   * 使用消耗品：铭文（星球位）直接升级牌型；符咒需要先选目标牌。
   * 需要目标的符咒会打开牌堆面板进入选择态，避免手牌为空时（商店页）用不了。
   */
  function startCharm(index: number) {
    const inst = state.consumables[index];
    const def = inst ? getConsumable(inst.defId) : undefined;
    if (!def) return;

    const need = def.needsTarget ?? 0;
    if (need === 0) {
      dispatch({ type: 'useConsumable', index });
      return;
    }
    setPicked([]);
    setPendingCharm(index);
  }

  function confirmCharm() {
    if (pendingCharm === null) return;
    dispatch({ type: 'useConsumable', index: pendingCharm, targetIds: picked });
    setPendingCharm(null);
    setPicked([]);
  }

  function cancelCharm() {
    setPendingCharm(null);
    setPicked([]);
  }

  const pendingDef =
    pendingCharm !== null ? getConsumable(state.consumables[pendingCharm]?.defId ?? '') : undefined;

  const ev = anim ? anim.result.events[Math.min(anim.step, anim.result.events.length - 1)] : null;

  let chips = 0;
  let mult = 0;
  let total = 0;
  let moneyGain = 0;
  let handLabel = '';
  let handType: HandType | null = null;
  let stepLabel = '';
  let boardMode: 'idle' | 'anim' | 'preview' = 'idle';

  if (anim && ev) {
    // 播放中：以 trace 的当前事件为准
    chips = ev.chipsAfter;
    mult = ev.multAfter;
    moneyGain = anim.result.money;
    handLabel = HAND_LABEL[anim.result.handType];
    handType = anim.result.handType;
    stepLabel = ev.label;
    boardMode = 'anim';
    if (anim.step === anim.result.events.length - 1) total = anim.result.score;
  } else if (preview) {
    // 选牌中：直接显示这一手的最终结果，不再播放
    chips = preview.chips;
    mult = preview.mult;
    total = preview.score;
    moneyGain = preview.money;
    handLabel = HAND_LABEL[preview.handType];
    handType = preview.handType;
    stepLabel = '预计本次得分';
    boardMode = 'preview';
  }

  /** 当前这手牌型的等级：只在 >1 时显示，避免到处是 Lv.1 噪音 */
  const handLevel = handType ? (state.handLevels[handType] ?? 1) : 1;

  const progress = Math.min(100, Math.round((state.roundScore / Math.max(state.target, 1)) * 100));
  const progressWithPreview = Math.min(
    100,
    Math.round(((state.roundScore + (preview?.score ?? 0)) / Math.max(state.target, 1)) * 100),
  );
  const remaining = Math.max(state.target - state.roundScore, 0);
  const countedIds = preview ? new Set(preview.scoringCardIds) : null;
  const debuffedIds = preview ? new Set(preview.debuffedCardIds) : null;
  /** 铁律：必须恰好出满 N 张 */
  const required = state.bossRule?.requirePlayedCards;
  const playBlocked = required ? state.selected.length !== required : state.selected.length === 0;
  /** 消耗品只在牌桌与商店可用（与 useConsumable 的判定保持一致） */
  const canUseConsumable = state.phase === 'playing' || state.phase === 'shop';

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
        <div className="stack stack-end" style={{ alignItems: 'flex-end' }}>
          <span className="label">资金</span>
          <span className="money">${state.money}</span>
        </div>
        <div className="topbar-actions">
          <button className="ghost-btn" onClick={() => setDeckOpen(true)}>
            {`牌堆 ${allCards.length}`}
          </button>
          <button className="ghost-btn" onClick={() => setShowLevels(true)}>
            牌型等级
          </button>
          <button className="ghost-btn" onClick={handleNewRun}>
            重开
          </button>
        </div>
      </header>

      {state.consumables.length > 0 && (
        <section className="consumable-row">
          <span className="row-label">铭文</span>
          {state.consumables.map((inst, i) => (
            <ConsumableView
              key={inst.uid}
              def={getConsumable(inst.defId)}
              onUse={() => startCharm(i)}
              disabled={!canUseConsumable}
            />
          ))}
        </section>
      )}

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
              const boss = i === 2 ? bossPreview : null;
              const effects = boss ? describeBlindRule(boss.rule).join(' · ') : '';
              const req = boss
                ? Math.round(targetFor(state.ante, i) * (boss.rule.targetMultiplier ?? 1))
                : targetFor(state.ante, i);
              return (
                <button
                  key={i}
                  className={`blind-card ${isCurrent ? 'is-current' : ''} ${isDone ? 'is-done' : ''}`}
                  disabled={!isCurrent}
                  onClick={() => dispatch({ type: 'selectBlind' })}
                >
                  <div>
                    <div className="name">
                      {BLIND_NAMES[i]}
                      {boss && <span className="boss-name">{boss.boss.name}</span>}
                    </div>
                    <div className="tag">{isDone ? '已通过' : effects || '待挑战'}</div>
                  </div>
                  <span className="req">{req}</span>
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

          {state.bossRule && (
            <div className="rule-bar">
              <span className="rule-name">Boss · {getBoss(state.bossId)?.name ?? '未知'}</span>
              <span>{describeBlindRule(state.bossRule).join(' · ')}</span>
            </div>
          )}

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
            <div className="score-hand">
              {handLabel || '未选牌'}
              {handLabel && handLevel > 1 && <span className="lv">{`Lv.${handLevel}`}</span>}
            </div>
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
            {moneyGain > 0 && <div className="score-money">{`另得 +$${moneyGain}`}</div>}
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
              debuffed={!!debuffedIds?.has(c.id)}
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
            disabled={busy || playBlocked}
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
          <span className={`counter ${required ? 'is-required' : ''}`}>
            已选 <b>{state.selected.length}</b>/{required ?? 5}
            {required ? ` · 必须出满 ${required} 张` : ''}
          </span>
        </footer>
      )}

      {state.phase === 'cashOut' && <CashOutPanel state={state} onConfirm={() => dispatch({ type: 'cashOut' })} />}
      {state.phase === 'shop' && state.shop && (
        <ShopPanel
          state={state}
          dispatch={dispatch}
          onShowLevels={() => setShowLevels(true)}
          onUseConsumable={startCharm}
        />
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

      <p className="site-note">
        非官方粉丝项目 · 与任何原作开发商、发行商无关联 · 非商业用途 · 不含原作素材
      </p>

      {showLevels && (
        <HandLevelPanel
          levels={state.handLevels}
          current={handType}
          onClose={() => setShowLevels(false)}
        />
      )}

      {(deckOpen || pendingCharm !== null) && (
        <DeckPanel
          cards={allCards}
          select={
            pendingCharm !== null
              ? {
                  count: pendingDef?.needsTarget ?? 1,
                  picked,
                  onToggle: (id) =>
                    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
                  onConfirm: confirmCharm,
                  onCancel: cancelCharm,
                }
              : undefined
          }
          onClose={() => setDeckOpen(false)}
        />
      )}
    </div>
  );
}

function CashOutPanel({ state, onConfirm }: { state: RunState; onConfirm: () => void }) {
  const reward = rewardFor(state.blindIndex);
  const bonus = state.handsLeft;
  const interest = Math.min(Math.floor(state.money / 5), 5);
  const goldCards = state.hand.filter((c) => c.enhancement === 'gold').length;
  const goldBonus = goldCards * 3;
  const jokerMoney = state.jokers.reduce((sum, inst) => {
    const def = getJoker(inst.defId);
    return sum + (def?.onRoundEnd ? def.onRoundEnd({ money: state.money, ante: state.ante }) : 0);
  }, 0);
  const total = state.money + reward + bonus + interest + jokerMoney + goldBonus;

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
          {goldBonus > 0 && (
            <div className="row">
              <span>{`鎏金留手 ×${goldCards}（每张 $3）`}</span>
              <b>+${goldBonus}</b>
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
  dispatch,
  onShowLevels,
  onUseConsumable,
}: {
  state: RunState;
  dispatch: Dispatch<Action>;
  onShowLevels: () => void;
  onUseConsumable: (index: number) => void;
}) {
  const shop = state.shop;
  if (!shop) return null;

  const jokerFull = state.jokers.length >= MAX_JOKERS;
  const consumableFull = state.consumables.length >= MAX_CONSUMABLES;
  const hasOwned = state.jokers.length > 0 || state.consumables.length > 0;

  return (
    <div className="overlay">
      <div className="panel panel-shop">
        <h2>商店</h2>
        <p className="sub">
          {`持有 $${state.money} · 小丑 ${state.jokers.length}/${MAX_JOKERS} · 铭文 ${state.consumables.length}/${MAX_CONSUMABLES}`}
        </p>

        <div className="shop-grid">
          {shop.offers.map((o, i) => {
            const isConsumable = o.kind === 'consumable';
            const def = isConsumable ? getConsumable(o.defId) : getJoker(o.defId);
            if (!def) return null;

            const full = isConsumable ? consumableFull : jokerFull;
            const poor = state.money < o.cost;
            const label = o.sold ? '已售出' : poor ? '钱不够' : full ? '槽位已满' : '购买';

            return (
              <div key={`${o.defId}-${i}`} className={`shop-item ${o.sold ? 'is-sold' : ''}`}>
                <div className="shop-item-head">
                  <span className="title">{def.name}</span>
                  <span className={`kind-tag ${isConsumable ? 'is-consumable' : 'is-joker'}`}>
                    {isConsumable ? '铭文' : '小丑'}
                  </span>
                </div>
                <div className="desc">{def.desc}</div>
                <div className="buy">
                  <span>${o.cost}</span>
                  <button
                    className="btn"
                    disabled={o.sold || poor || full}
                    onClick={() =>
                      dispatch(
                        isConsumable
                          ? { type: 'buyConsumable', index: i }
                          : { type: 'buyJoker', index: i },
                      )
                    }
                  >
                    {label}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="owned">
          <div className="owned-head">
            你的牌 <span className="owned-hint">卖出价 = 原价一半（最低 $1），只能在这里卖出</span>
          </div>
          {hasOwned ? (
            <div className="owned-list">
              {state.jokers.map((inst, i) => {
                const def = getJoker(inst.defId);
                if (!def) return null;
                return (
                  <div key={inst.uid} className="owned-item">
                    <span className="owned-name">{def.name}</span>
                    <span className="owned-desc">{def.desc}</span>
                    <button
                      className="btn btn-sell"
                      onClick={() => dispatch({ type: 'sellJoker', index: i })}
                    >
                      {`卖出 $${sellValue(def.cost)}`}
                    </button>
                  </div>
                );
              })}
              {state.consumables.map((inst, i) => {
                const def = getConsumable(inst.defId);
                if (!def) return null;
                return (
                  <div key={inst.uid} className="owned-item">
                    <span className="owned-name">{def.name}</span>
                    <span className="owned-desc">{def.desc}</span>
                    <button className="btn" onClick={() => onUseConsumable(i)}>
                      使用
                    </button>
                    <button
                      className="btn btn-sell"
                      onClick={() => dispatch({ type: 'sellConsumable', index: i })}
                    >
                      {`卖出 $${sellValue(def.cost)}`}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="owned-empty">还没有任何牌。买到的东西会出现在这里。</p>
          )}
        </div>

        <div className="panel-actions">
          <button
            className="btn"
            disabled={state.money < shop.rerollCost}
            onClick={() => dispatch({ type: 'reroll' })}
          >
            {`重摇 $${shop.rerollCost}`}
          </button>
          <button className="ghost-btn" onClick={onShowLevels}>
            牌型等级
          </button>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'leaveShop' })}>
            继续下一盲注
          </button>
        </div>
      </div>
    </div>
  );
}
