/**
 * Vertical icon rail for switching entity types in the Unified Customizer.
 */
import { ContentCategory } from '../../consts/contentBrowserTypes';

const RAIL_ITEMS: { category: ContentCategory; label: string; abbrev: string }[] = [
  { category: ContentCategory.OPERATORS, label: 'Operator', abbrev: 'OP' },
  { category: ContentCategory.WEAPONS, label: 'Weapon', abbrev: 'WPN' },
  { category: ContentCategory.GEAR_SETS, label: 'Gear Set', abbrev: 'GR' },
  { category: ContentCategory.SKILLS, label: 'Skill', abbrev: 'SK' },
  { category: ContentCategory.WEAPON_EFFECTS, label: 'Weapon Effect', abbrev: 'WE' },
  { category: ContentCategory.GEAR_EFFECTS, label: 'Gear Effect', abbrev: 'GE' },
  { category: ContentCategory.OPERATOR_STATUSES, label: 'Operator Status', abbrev: 'ST' },
  { category: ContentCategory.OPERATOR_TALENTS, label: 'Operator Talent', abbrev: 'TL' },
];

interface Props {
  active: ContentCategory;
  onChange: (category: ContentCategory) => void;
}

export default function UnifiedCustomizerRail({ active, onChange }: Props) {
  return (
    <div className="uc-rail">
      {RAIL_ITEMS.map(({ category, label, abbrev }) => (
        <button
          key={category}
          className={`uc-rail-btn${active === category ? ' uc-rail-btn--active' : ''}`}
          onClick={() => onChange(category)}
          title={label}
        >
          {abbrev}
        </button>
      ))}
    </div>
  );
}
