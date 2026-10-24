import type { JokerDef } from '../core/jokers';

export function JokerView({ def }: { def?: JokerDef }) {
  if (!def) return <div className="joker joker-empty" />;
  return (
    <div className={`joker joker-${def.rarity}`} title={def.desc}>
      <div className="joker-name">{def.name}</div>
      <div className="joker-desc">{def.desc}</div>
    </div>
  );
}
