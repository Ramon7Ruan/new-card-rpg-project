import type { ConsumableDef } from '../core/consumables';

export function ConsumableView({
  def,
  onUse,
  disabled,
}: {
  def?: ConsumableDef;
  onUse?: () => void;
  disabled?: boolean;
}) {
  if (!def) return <div className="consumable consumable-empty" />;

  return (
    <div className="consumable" title={def.desc}>
      <div className="consumable-name">{def.name}</div>
      <div className="consumable-desc">{def.desc}</div>
      <button className="use-btn" disabled={disabled} onClick={onUse}>
        使用
      </button>
    </div>
  );
}
