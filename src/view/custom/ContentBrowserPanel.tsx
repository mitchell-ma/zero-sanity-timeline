/**
 * Sidebar panel listing all game content by category.
 * Shown when the pencil icon is active in the sidebar icon strip.
 */
import { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ContentCategory, ContentBrowserItem, ContentSelection } from '../../consts/contentBrowserTypes';
import { getAllContentItems } from '../../controller/custom/contentCatalogController';
import {
  deleteCustomOperator,
  duplicateCustomOperator,
  createCustomOperator,
} from '../../controller/custom/customOperatorController';
import {
  deleteCustomWeapon,
  duplicateCustomWeapon,
  createCustomWeapon,
} from '../../controller/custom/customWeaponController';
import {
  deleteCustomGearSet,
  duplicateCustomGearSet,
  createCustomGearSet,
} from '../../controller/custom/customGearController';
import {
  deleteCustomSkill,
  duplicateCustomSkill,
  createCustomSkill,
} from '../../controller/custom/customSkillController';
import ContextMenu from '../ContextMenu';
import type { ContextMenuItem, ContextMenuState } from '../../consts/viewTypes';

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

/** Categories that support creating new custom items. */
const CREATABLE_CATEGORIES = new Set([
  ContentCategory.OPERATORS,
  ContentCategory.WEAPONS,
  ContentCategory.GEAR_SETS,
  ContentCategory.SKILLS,
]);

/** Categories that support cloning built-in items. */
const CLONABLE_CATEGORIES = new Set([
  ContentCategory.OPERATORS,
  ContentCategory.WEAPONS,
  ContentCategory.GEAR_SETS,
  ContentCategory.SKILLS,
]);

interface Props {
  selectedItem: ContentSelection | null;
  onSelectItem: (item: ContentSelection) => void;
  /** Request to clone a built-in item as custom — handled by App.tsx. */
  onCloneAsCustom?: (item: ContentSelection) => void;
  /** Request to edit a custom item — handled by App.tsx. */
  onEditCustom?: (item: ContentSelection) => void;
  /** Called after any item is deleted/duplicated so parent can refresh. */
  onContentChanged?: () => void;
  /** External refresh trigger — bump to re-fetch content items. */
  refreshKey?: number;
}

export default function ContentBrowserPanel({
  selectedItem,
  onSelectItem,
  onCloneAsCustom,
  onEditCustom,
  onContentChanged,
  refreshKey: externalRefreshKey,
}: Props) {
  const [filter, setFilter] = useState('');
  const [showBase, setShowBase] = useState(true);
  const [showCustom, setShowCustom] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATEGORY_ORDER.map((cat) => [cat, true]))
  );
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const allItems = useMemo(() => getAllContentItems(), [refreshKey, externalRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!showBase && item.source === 'builtin') continue;
      if (!showCustom && item.source === 'custom') continue;
      groups[item.category].push(item);
    }
    return groups;
  }, [allItems, filterLower, showBase, showCustom]);

  const toggleCategory = (cat: ContentCategory) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const isSelected = (item: ContentBrowserItem) =>
    selectedItem?.id === item.id && selectedItem?.category === item.category && selectedItem?.source === item.source;

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    onContentChanged?.();
  }, [onContentChanged]);

  const handleContextMenu = useCallback((e: React.MouseEvent, item: ContentBrowserItem) => {
    e.preventDefault();
    e.stopPropagation();
    const menuItems: ContextMenuItem[] = [];

    if (item.source === 'custom') {
      // Custom items: Edit, Duplicate, Delete
      if (onEditCustom) {
        menuItems.push({
          label: 'Edit',
          action: () => onEditCustom({ id: item.id, category: item.category, source: item.source }),
        });
      }

      menuItems.push({
        label: 'Duplicate',
        action: () => {
          if (item.category === ContentCategory.OPERATORS) {
            const clone = duplicateCustomOperator(item.id);
            if (clone) createCustomOperator(clone);
          } else if (item.category === ContentCategory.WEAPONS) {
            const clone = duplicateCustomWeapon(item.id);
            if (clone) createCustomWeapon(clone);
          } else if (item.category === ContentCategory.GEAR_SETS) {
            const clone = duplicateCustomGearSet(item.id);
            if (clone) createCustomGearSet(clone);
          } else if (item.category === ContentCategory.SKILLS) {
            const clone = duplicateCustomSkill(item.id);
            if (clone) createCustomSkill(clone);
          }
          refresh();
        },
      });

      menuItems.push({ separator: true });

      menuItems.push({
        label: 'Delete',
        danger: true,
        action: () => {
          if (item.category === ContentCategory.OPERATORS) {
            deleteCustomOperator(item.id);
          } else if (item.category === ContentCategory.WEAPONS) {
            deleteCustomWeapon(item.id);
          } else if (item.category === ContentCategory.GEAR_SETS) {
            deleteCustomGearSet(item.id);
          } else if (item.category === ContentCategory.SKILLS) {
            deleteCustomSkill(item.id);
          }
          refresh();
        },
      });
    } else {
      // Built-in items: Clone as Custom (for supported categories)
      if (CLONABLE_CATEGORIES.has(item.category) && onCloneAsCustom) {
        menuItems.push({
          label: 'Clone as Custom',
          action: () => onCloneAsCustom({ id: item.id, category: item.category, source: item.source }),
        });
      }

      // Built-in items cannot be edited or deleted
      menuItems.push({
        label: 'Delete',
        disabled: true,
        disabledReason: 'Cannot delete base content',
      });
    }

    if (menuItems.length > 0) {
      setCtxMenu({ x: e.clientX, y: e.clientY, items: menuItems });
    }
  }, [onCloneAsCustom, onEditCustom, refresh]);

  const handleCategoryContextMenu = useCallback((e: React.MouseEvent, cat: ContentCategory) => {
    if (!CREATABLE_CATEGORIES.has(cat)) return;
    e.preventDefault();
    e.stopPropagation();

    const label = CATEGORY_LABELS[cat];
    const menuItems: ContextMenuItem[] = [
      {
        label: `New Custom ${label.replace(/s$/, '')}`,
        action: () => {
          // Signal creation via onEditCustom with a special 'new' source
          onEditCustom?.({ id: '__new__', category: cat, source: 'custom' });
        },
      },
    ];

    setCtxMenu({ x: e.clientX, y: e.clientY, items: menuItems });
  }, [onEditCustom]);

  return (
    <div className="sidebar-panel content-browser">
      <div className="loadout-filter-row">
        <input
          className="loadout-filter-input"
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="content-source-toggles">
          <button
            className={`content-source-toggle${showBase ? ' active' : ''}`}
            onClick={() => setShowBase((v) => !v)}
            title="Show base content"
          >Base</button>
          <button
            className={`content-source-toggle${showCustom ? ' active' : ''}`}
            onClick={() => setShowCustom((v) => !v)}
            title="Show custom content"
          >Custom</button>
        </div>
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
                onContextMenu={(e) => handleCategoryContextMenu(e, cat)}
              >
                <span className="content-category-chevron">
                  {isCollapsed ? '\u25B6' : '\u25BC'}
                </span>
                <span className="content-category-label">
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="content-category-count">{items.length}</span>
              </button>

              {!isCollapsed && (() => {
                const baseItems = items.filter((i) => i.source === 'builtin');
                const customItems = items.filter((i) => i.source === 'custom');
                const renderItem = (item: ContentBrowserItem) => (
                  <button
                    key={`${item.source}:${item.id}`}
                    className={`content-item${isSelected(item) ? ' content-item--selected' : ''}${item.source === 'custom' ? ' content-item--custom' : ''}`}
                    onClick={() => onSelectItem({ id: item.id, category: item.category, source: item.source })}
                    onContextMenu={(e) => handleContextMenu(e, item)}
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
                );
                return (
                  <>
                    {baseItems.map(renderItem)}
                    {baseItems.length > 0 && customItems.length > 0 && (
                      <div className="content-item-divider" />
                    )}
                    {customItems.map(renderItem)}
                  </>
                );
              })()}
            </div>
          );
        })}
      </div>

      {ctxMenu && createPortal(
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />,
        document.body,
      )}
    </div>
  );
}
