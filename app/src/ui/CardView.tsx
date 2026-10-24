import { isRedSuit, rankLabel, SUIT_SYMBOL } from '../core/cards';
import type { Card } from '../core/types';

interface Props {
  card: Card;
  selected?: boolean;
  scoring?: boolean;
  small?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function CardView({ card, selected, scoring, small, disabled, onClick }: Props) {
  const cls = [
    'card',
    small ? 'card-sm' : '',
    isRedSuit(card.suit) ? 'is-red' : 'is-black',
    selected ? 'is-selected' : '',
    scoring ? 'is-scoring' : '',
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
