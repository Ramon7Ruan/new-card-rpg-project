import { isRedSuit, rankLabel, SUIT_SYMBOL } from '../core/cards';
import type { Card } from '../core/types';

interface Props {
  card: Card;
  selected?: boolean;
  /** 动画播放阶段：这张牌正在被计入 */
  scoring?: boolean;
  /** 选牌预览阶段：这张牌会被计分（角标提示） */
  counted?: boolean;
  /** 被 Boss 规则压制：不计分（红色斜线） */
  debuffed?: boolean;
  small?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function CardView({ card, selected, scoring, counted, debuffed, small, disabled, onClick }: Props) {
  const cls = [
    'card',
    small ? 'card-sm' : '',
    isRedSuit(card.suit) ? 'is-red' : 'is-black',
    selected ? 'is-selected' : '',
    scoring ? 'is-scoring' : '',
    counted ? 'is-counted' : '',
    debuffed ? 'is-debuffed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled || !onClick}>
      <span className="card-corner">{rankLabel(card.rank)}</span>
      <span className="card-pip">{SUIT_SYMBOL[card.suit]}</span>
      <span className="card-corner card-corner-bottom">{rankLabel(card.rank)}</span>
    </button>
  );
}
