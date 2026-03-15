/**
 * Sidebar panel listing all game content by category.
 * Shown when the pencil icon is active in the sidebar icon strip.
 */
import { useState, useMemo } from 'react';
import { ContentCategory, ContentBrowserItem, ContentSelection } from '../../consts/contentBrowserTypes';
import { getAllContentItems } from '../../controller/custom/contentCatalogController';

const CATEGORY_LABELS: Record<ContentCategory, string> = {
  [ContentCategory.OPERATORS]: 'Operators',
  [ContentCategory.SKILLS]: 'Skills',
  [ContentCategory.TALENTS]: 'Talents',
  [ContentCategory.WEAPONS]: 'Weapons',
  [ContentCategory.GEAR_SETS]: 'Gear Sets',
  [ContentCategory.WEAPON_EFFECTS]: 'Weapon Effects',
  [ContentCategory.GEAR_EFFECTS]: 'Gear Effects',
};

const CATEGORY_ORDER: ContentCategory[] = [
  ContentCategory.OPERATORS,
  ContentCategory.SKILLS,
  ContentCategory.TALENTS,
  ContentCategory.WEAPONS,
  ContentCategory.GEAR_SETS,
  ContentCategory.WEAPON_EFFECTS,
  ContentCategory.GEAR_EFFECTS,
];

interface Props {
  selectedItem: ContentSelection | null;
  onSelectItem: (item: ContentSelection) => void;
}

export default function ContentBrowserPanel({ selectedItem, onSelectItem }: Props) {
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATEGORY_ORDER.map((cat) => [cat, true]))
  );

  const allItems = useMemo(() => getAllContentItems(), []);

  const filterLower = filter.toLowerCase();

  const grouped = useMemo(() => {
    const groups: Record<ContentCategory, ContentBrowserItem[]> = {
      [ContentCategory.OPERATORS]: [],
      [ContentCategory.SKILLS]: [],
      [ContentCategory.TALENTS]: [],
      [ContentCategory.WEAPONS]: [],
      [ContentCategory.GEAR_SETS]: [],
      [ContentCategory.WEAPON_EFFECTS]: [],
      [ContentCategory.GEAR_EFFECTS]: [],
    };
    for (const item of allItems) {
      if (filterLower && !item.name.toLowerCase().includes(filterLower)) continue;
      groups[item.category].push(item);
    }
    return groups;
  }, [allItems, filterLower]);

  const toggleCategory = (cat: ContentCategory) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const isSelected = (item: ContentBrowserItem) =>
    selectedItem?.id === item.id && selectedItem?.category === item.category && selectedItem?.source === item.source;

  return (
    <div className="sidebar-panel content-browser">
      <div className="loadout-filter-row">
        <input
          className="loadout-filter-input"
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="content-browser-list">
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat];
          if (filterLower && items.length === 0) return null;
          const isCollapsed = collapsed[cat] && !filterLower;

          return (
            <div key={cat} className="content-category">
              <button
                className="content-category-header"
                onClick={() => toggleCategory(cat)}
              >
                <span className="content-category-chevron">
                  {isCollapsed ? '\u25B6' : '\u25BC'}
                </span>
                <span className="content-category-label">
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="content-category-count">{items.length}</span>
              </button>

              {!isCollapsed && items.map((item) => (
                <button
                  key={`${item.source}:${item.id}`}
                  className={`content-item${isSelected(item) ? ' content-item--selected' : ''}${item.source === 'custom' ? ' content-item--custom' : ''}`}
                  onClick={() => onSelectItem({ id: item.id, category: item.category, source: item.source })}
                >
                  {item.color && (
                    <span
                      className="content-item-dot"
                      style={{ background: item.color }}
                    />
                  )}
                  <span className="content-item-name">{item.name}</span>
                  <span className="content-item-meta">{item.meta}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
