import { SUITS, SUIT_SYMBOL } from '../core/cards';
import type { Card } from '../core/types';
import { CardView } from './CardView';

/**
 * 牌堆面板。两个用途共用一套版式：
 * - 只读：查看整副牌（牌堆 + 弃牌堆 + 手牌），确认增强了哪些、还剩几张
 * - 选目标：符咒需要指定牌时，点卡面选中，够数才能确认
 */
export function DeckPanel({
  cards,
  select,
  onClose,
}: {
  cards: Card[];
  select?: {
    count: number;
    picked: string[];
    onToggle: (id: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
  };
  onClose: () => void;
}) {
  const enhanced = cards.filter((c) => c.enhancement).length;
  const sealed = cards.filter((c) => c.seal).length;
  const pickedSet = new Set(select?.picked ?? []);
  const full = select ? select.picked.length >= select.count : false;

  return (
    <div className="overlay" onClick={select ? undefined : onClose}>
      <div className="panel panel-deck">
        <h2>{select ? `选择 ${select.count} 张牌` : '牌堆'}</h2>
        <p className="sub">
          {`共 ${cards.length} 张 · 增强 ${enhanced} 张 · 蜡封 ${sealed} 张`}
          {select ? ` · 已选 ${select.picked.length}/${select.count}` : ''}
        </p>

        <div className="deck-scroll">
          {SUITS.map((suit) => {
            const group = cards.filter((c) => c.suit === suit).sort((a, b) => a.rank - b.rank);
            if (group.length === 0) return null;
            return (
              <div className="deck-group" key={suit}>
                <span className={`deck-suit ${suit === 'heart' || suit === 'diamond' ? 'is-red' : ''}`}>
                  {SUIT_SYMBOL[suit]}
                </span>
                <div className="deck-cards">
                  {group.map((card) => {
                    const picked = pickedSet.has(card.id);
                    return (
                      <CardView
                        key={card.id}
                        card={card}
                        small
                        selected={picked}
                        onClick={
                          select
                            ? () => {
                                if (!picked && full) return;
                                select.onToggle(card.id);
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="panel-actions">
          {select ? (
            <>
              <span className="owned-hint">
                {`需要 ${select.count} 张${full ? ' · 可以确认' : ''}`}
              </span>
              <div className="spacer" />
              <button className="btn" onClick={select.onCancel}>
                取消
              </button>
              <button className="btn btn-primary" disabled={select.picked.length !== select.count} onClick={select.onConfirm}>
                确认
              </button>
            </>
          ) : (
            <>
              <span className="owned-hint">{`按花色排列 · 悬浮卡面可看增强与蜡封说明`}</span>
              <div className="spacer" />
              <button className="btn btn-primary" onClick={onClose}>
                关闭
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
