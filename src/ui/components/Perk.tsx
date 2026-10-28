import type { ActivePerk, GameId, PerkDef } from '../../core/types';
import { RARITY_LABEL, durationLabel, fillText, perkDef } from '../../core/perks/registry';
import { PixelIcon } from './kit';
import { CardName } from '../pixel/Type';

export const rarityClass = (def: Pick<PerkDef, 'kind' | 'rarity'>) => `${def.kind === 'curse' ? 'c' : 'r'}-${def.rarity}`;

export const RARITY_COLOR: Record<string, string> = {
  'r-common': '#d8cfb8',
  'r-rare': '#4fb3ff',
  'r-epic': '#b06aff',
  'r-legendary': '#ffc23a',
  'c-common': '#a5c95a',
  'c-rare': '#ec5a43',
  'c-epic': '#ff2a55',
  'c-legendary': '#ff2a55',
};

export const perkColor = (def: Pick<PerkDef, 'kind' | 'rarity'>) => RARITY_COLOR[rarityClass(def)];

export function PerkChip({ perk, onClick, size = 30 }: { perk: ActivePerk; onClick?: () => void; size?: number }) {
  const def = perkDef(perk.defId);
  const color = perkColor(def);
  return (
    <button
      type="button"
      className={`perk-chip ${rarityClass(def)} ${def.kind}`}
      style={{ width: size, height: size }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title={`${def.name}: ${fillText(def, perk.params)}`}
    >
      <PixelIcon id={def.icon} color={color} size={Math.max(10, size - 6)} />
      {perk.left !== undefined && <span className="perk-chip-n">{perk.left}</span>}
    </button>
  );
}

export function PerkCard({
  def,
  params,
  left,
  game,
  compact,
  from,
}: {
  def: PerkDef;
  params?: Record<string, string>;
  left?: number;
  game: GameId;
  compact?: boolean;
  from?: string;
}) {
  const color = perkColor(def);
  return (
    <div className={`perk-card ${rarityClass(def)} ${def.kind} ${compact ? 'compact' : ''}`}>
      <div className="perk-card-rarity">
        {def.kind === 'blessing' ? 'Дар' : 'Проклятие'} · {RARITY_LABEL[def.kind][def.rarity]}
      </div>
      <div className="perk-card-icon">
        <PixelIcon id={def.icon} color={color} size={compact ? 40 : 70} />
      </div>
      <CardName size={compact ? 15 : 18}>{def.name}</CardName>
      <div className="perk-card-text">{fillText(def, params)}</div>
      <div className="perk-card-foot">
        <span>⧗ {durationLabel(def, game, left)}</span>
        {def.effect && <span title="Приложение применит эффект само">⚙ авто</span>}
      </div>
      {from && <div className="perk-card-from">от {from}</div>}
    </div>
  );
}
