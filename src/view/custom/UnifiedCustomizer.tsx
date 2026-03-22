/**
 * V2 Unified Customizer — full-page browser + editor for all entity types.
 * Layout: Rail | Item List | View/Edit Panel
 *
 * - Browse builtin and custom items for any entity type
 * - View read-only details for builtin items
 * - Clone builtin → custom for editing
 * - Create / edit / delete custom items inline
 * - Associate leaf entities (skills, effects) with operators
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ContentCategory } from '../../consts/contentBrowserTypes';
import type { ContentBrowserItem } from '../../consts/contentBrowserTypes';
import { getAllContentItems } from '../../controller/custom/contentCatalogController';
import type { CustomWeapon } from '../../model/custom/customWeaponTypes';
import type { CustomGearSet } from '../../model/custom/customGearTypes';
import type { CustomOperator } from '../../model/custom/customOperatorTypes';
import type { CustomSkill } from '../../model/custom/customSkillTypes';
import type { CustomWeaponEffect } from '../../model/custom/customWeaponEffectTypes';
import type { CustomGearEffect } from '../../model/custom/customGearEffectTypes';
import type { CustomOperatorStatus } from '../../model/custom/customOperatorStatusTypes';
import type { CustomOperatorTalent } from '../../model/custom/customOperatorTalentTypes';
import { getDefaultCustomWeapon, getCustomWeapons } from '../../controller/custom/customWeaponController';
import { getDefaultCustomGearSet, getCustomGearSets } from '../../controller/custom/customGearController';
import { getDefaultCustomOperator, getCustomOperators } from '../../controller/custom/customOperatorController';
import { getDefaultCustomSkill, getCustomSkills } from '../../controller/custom/customSkillController';
import { getDefaultCustomWeaponEffect, getCustomWeaponEffects } from '../../controller/custom/customWeaponEffectController';
import { getDefaultCustomGearEffect, getCustomGearEffects } from '../../controller/custom/customGearEffectController';
import { getDefaultCustomOperatorStatus, getCustomOperatorStatuses } from '../../controller/custom/customOperatorStatusController';
import { getDefaultCustomOperatorTalent, getCustomOperatorTalents } from '../../controller/custom/customOperatorTalentController';
import { addSkillLink, removeSkillLink, getLinksForOperator } from '../../controller/custom/customSkillLinkController';
import { deleteCustomOperator } from '../../controller/custom/customOperatorController';
import { deleteCustomWeapon } from '../../controller/custom/customWeaponController';
import { deleteCustomGearSet } from '../../controller/custom/customGearController';
import { deleteCustomSkill } from '../../controller/custom/customSkillController';
import { deleteCustomWeaponEffect } from '../../controller/custom/customWeaponEffectController';
import { deleteCustomGearEffect } from '../../controller/custom/customGearEffectController';
import { deleteCustomOperatorStatus } from '../../controller/custom/customOperatorStatusController';
import { deleteCustomOperatorTalent } from '../../controller/custom/customOperatorTalentController';
import { ALL_OPERATORS } from '../../controller/operators/operatorRegistry';
import { getGearPiecesBySet, getWeapon, getWeaponIdByName } from '../../controller/gameDataController';
import { getWeaponEffectDefs, getGearEffectDefs, resolveTargetDisplay, resolveDurationSeconds, resolveTriggerInteractions } from '../../model/game-data/weaponGearEffectLoader';
import { getGearSetData } from '../../model/game-data/gearSetDataLoader';
import type { GearPieceData } from '../../model/game-data/gearSetDataLoader';
import { getGearSetEffects } from '../../consts/gearSetEffects';
import { GearSetType, GearCategory, SegmentType } from '../../consts/enums';
import type { SkillType, SkillDef } from '../../consts/viewTypes';
import { computeSegmentsSpan } from '../../consts/viewTypes';
import type { Interaction, Effect, Predicate } from '../../consts/semantics';
import { getLeafValue } from '../../controller/calculation/valueResolver';
import { getOperatorJson } from '../../model/event-frames/operatorJsonLoader';
import { resolveComboTrigger, resolveUltimateEnergy } from '../../controller/info-pane/loadoutPaneController';
import { buildSkillEntries, SkillEntrySection, type SkillEntryData } from './OperatorEventEditor';
import { fmtN } from '../../utils/timeline';
import type { CustomStatusEventDef } from '../../model/custom/customStatusEventTypes';
import UnifiedCustomizerRail from './UnifiedCustomizerRail';
import WeaponSection from './sections/WeaponSection';
import GearSetSection from './sections/GearSetSection';
import OperatorSection from './sections/OperatorSection';
import SkillSection from './sections/SkillSection';
import WeaponEffectSection from './sections/WeaponEffectSection';
import GearEffectSection from './sections/GearEffectSection';
import OperatorStatusSection from './sections/OperatorStatusSection';
import OperatorTalentSection from './sections/OperatorTalentSection';

const CATEGORY_TITLES: Partial<Record<ContentCategory, string>> = {
  [ContentCategory.OPERATORS]: 'Operators',
  [ContentCategory.WEAPONS]: 'Weapons',
  [ContentCategory.GEAR_SETS]: 'Gears',
  [ContentCategory.SKILLS]: 'Skills',
  [ContentCategory.WEAPON_EFFECTS]: 'Weapon Effects',
  [ContentCategory.OPERATOR_STATUSES]: 'Operator Statuses',
  [ContentCategory.OPERATOR_TALENTS]: 'Operator Talents',
};

const SUPPORTED_CATEGORIES = new Set(Object.keys(CATEGORY_TITLES));

/** Categories that are "leaf" entities — can be associated with an operator. */
const ASSOCIABLE_CATEGORIES = new Set([
  ContentCategory.SKILLS,
  ContentCategory.WEAPON_EFFECTS,
  ContentCategory.GEAR_EFFECTS,
  ContentCategory.OPERATOR_STATUSES,
  ContentCategory.OPERATOR_TALENTS,
]);

type CustomData = CustomWeapon | CustomGearSet | CustomOperator | CustomSkill | CustomWeaponEffect | CustomGearEffect | CustomOperatorStatus | CustomOperatorTalent;

function getDefaultData(category: ContentCategory): CustomData | null {
  switch (category) {
    case ContentCategory.OPERATORS: return getDefaultCustomOperator();
    case ContentCategory.WEAPONS: return getDefaultCustomWeapon();
    case ContentCategory.GEAR_SETS: return getDefaultCustomGearSet();
    case ContentCategory.SKILLS: return getDefaultCustomSkill();
    case ContentCategory.WEAPON_EFFECTS: return getDefaultCustomWeaponEffect();
    case ContentCategory.GEAR_EFFECTS: return getDefaultCustomGearEffect();
    case ContentCategory.OPERATOR_STATUSES: return getDefaultCustomOperatorStatus();
    case ContentCategory.OPERATOR_TALENTS: return getDefaultCustomOperatorTalent();
    default: return null;
  }
}

function findCustomData(category: ContentCategory, id: string): CustomData | undefined | null {
  switch (category) {
    case ContentCategory.OPERATORS: return getCustomOperators().find((o) => o.id === id);
    case ContentCategory.WEAPONS: return getCustomWeapons().find((w) => w.id === id);
    case ContentCategory.GEAR_SETS: return getCustomGearSets().find((g) => g.id === id);
    case ContentCategory.SKILLS: return getCustomSkills().find((s) => s.id === id);
    case ContentCategory.WEAPON_EFFECTS: return getCustomWeaponEffects().find((e) => e.id === id);
    case ContentCategory.GEAR_EFFECTS: return getCustomGearEffects().find((e) => e.id === id);
    case ContentCategory.OPERATOR_STATUSES: return getCustomOperatorStatuses().find((s) => s.id === id);
    case ContentCategory.OPERATOR_TALENTS: return getCustomOperatorTalents().find((t) => t.id === id);
    default: return null;
  }
}

type PanelMode = 'browse' | 'view' | 'edit';

interface Props {
  initial?: { entityType: ContentCategory; data: CustomData };
  onSave: (type: ContentCategory, data: CustomData) => string[];
  onCancel: () => void;
  onContentChanged?: () => void;
  contentRefreshKey?: number;
}

export default function UnifiedCustomizer({ initial, onSave, onCancel, onContentChanged, contentRefreshKey }: Props) {
  const [entityType, setEntityType] = useState<ContentCategory>(
    initial?.entityType ?? ContentCategory.OPERATORS
  );
  const [filter, setFilter] = useState('');
  const [selectedItem, setSelectedItem] = useState<ContentBrowserItem | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(initial ? 'edit' : 'browse');
  const [editData, setEditData] = useState<CustomData | null>(initial?.data ? JSON.parse(JSON.stringify(initial.data)) : null);
  const [editOriginalId, setEditOriginalId] = useState<string | undefined>(initial?.data?.id);
  const [errors, setErrors] = useState<string[]>([]);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  // Association state
  const [showAssociatePanel, setShowAssociatePanel] = useState(false);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; item: ContentBrowserItem } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const dismiss = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, [ctxMenu]);

  const bumpLocal = useCallback(() => {
    setLocalRefreshKey((k) => k + 1);
    onContentChanged?.();
  }, [onContentChanged]);

  const handleEditItem = useCallback((item: ContentBrowserItem) => {
    if (item.source !== 'custom') return;
    const data = findCustomData(item.category, item.id);
    if (!data) return;
    setEditData(JSON.parse(JSON.stringify(data)));
    setEditOriginalId(item.id);
    setPanelMode('edit');
    setErrors([]);
  }, []);

  const handleDeleteCustomItem = useCallback((item: ContentBrowserItem) => {
    switch (item.category) {
      case ContentCategory.OPERATORS: deleteCustomOperator(item.id); break;
      case ContentCategory.WEAPONS: deleteCustomWeapon(item.id); break;
      case ContentCategory.GEAR_SETS: deleteCustomGearSet(item.id); break;
      case ContentCategory.SKILLS: deleteCustomSkill(item.id); break;
      case ContentCategory.WEAPON_EFFECTS: deleteCustomWeaponEffect(item.id); break;
      case ContentCategory.GEAR_EFFECTS: deleteCustomGearEffect(item.id); break;
      case ContentCategory.OPERATOR_STATUSES: deleteCustomOperatorStatus(item.id); break;
      case ContentCategory.OPERATOR_TALENTS: deleteCustomOperatorTalent(item.id); break;
    }
    if (selectedItem?.id === item.id) {
      setSelectedItem(null);
      setPanelMode('browse');
    }
    bumpLocal();
  }, [selectedItem, bumpLocal]);

  const handleCtxAction = useCallback((action: 'delete' | 'duplicate' | 'edit') => {
    if (!ctxMenu) return;
    const item = ctxMenu.item;
    setCtxMenu(null);
    if (action === 'edit' && item.source === 'custom') {
      handleEditItem(item);
    } else if (action === 'delete' && item.source === 'custom') {
      handleDeleteCustomItem(item);
    } else if (action === 'duplicate' && item.source === 'builtin') {
      // Clone inline — same logic as handleCloneItem
      const data = getDefaultData(item.category);
      if (!data) return;
      (data as { name: string }).name = `${item.name} (Clone)`;
      (data as { id: string }).id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setEditData(data);
      setEditOriginalId(undefined);
      setPanelMode('edit');
      setErrors([]);
    }
  }, [ctxMenu, handleDeleteCustomItem, handleEditItem]);

  // Item list for the current entity type
  const items = useMemo(() => {
    const all = getAllContentItems();
    return all.filter((item) => item.category === entityType);
  }, [entityType, localRefreshKey, contentRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const filterLower = filter.toLowerCase();
  const filteredItems = useMemo(() => {
    if (!filterLower) return items;
    return items.filter((item) => item.name.toLowerCase().includes(filterLower));
  }, [items, filterLower]);

  const builtinItems = filteredItems.filter((i) => i.source === 'builtin');
  const customItems = filteredItems.filter((i) => i.source === 'custom');

  const handleEntityTypeChange = useCallback((cat: ContentCategory) => {
    if (!SUPPORTED_CATEGORIES.has(cat)) return;
    setEntityType(cat);
    setSelectedItem(null);
    setPanelMode('browse');
    setEditData(null);
    setErrors([]);
    setFilter('');
  }, []);

  const handleSelectItem = useCallback((item: ContentBrowserItem) => {
    setSelectedItem(item);
    setPanelMode('view');
    setEditData(null);
    setErrors([]);
    setShowAssociatePanel(false);
  }, []);

  const handleNewItem = useCallback(() => {
    const data = getDefaultData(entityType);
    setEditData(data);
    setEditOriginalId(undefined);
    setPanelMode('edit');
    setSelectedItem(null);
    setErrors([]);
  }, [entityType]);

  const handleCloneItem = useCallback((item: ContentBrowserItem) => {
    // Clone a builtin item as a new custom item
    // For builtins, we just create a default with the same name
    const data = getDefaultData(item.category);
    if (!data) return;
    (data as { name: string }).name = `${item.name} (Clone)`;
    (data as { id: string }).id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setEditData(data);
    setEditOriginalId(undefined);
    setPanelMode('edit');
    setErrors([]);
  }, []);

  const handleSave = useCallback(() => {
    if (!editData) return;
    const result = onSave(entityType, editData);
    if (result.length > 0) {
      setErrors(result);
      return;
    }
    setErrors([]);
    setPanelMode('browse');
    setEditData(null);
    setSelectedItem(null);
    bumpLocal();
  }, [entityType, editData, onSave, bumpLocal]);

  const handleCancelEdit = useCallback(() => {
    setPanelMode(selectedItem ? 'view' : 'browse');
    setEditData(null);
    setErrors([]);
  }, [selectedItem]);

  // Operator list for association
  const allOperators = useMemo(() => {
    const builtins = ALL_OPERATORS.map((op) => ({ id: op.id, name: op.name, source: 'builtin' as const }));
    const customs = getCustomOperators().map((op) => ({ id: `custom_${op.id}`, name: op.name, source: 'custom' as const }));
    return [...builtins, ...customs];
  }, [localRefreshKey, contentRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderEditForm = () => {
    if (!editData) return null;
    const origId = editOriginalId;
    switch (entityType) {
      case ContentCategory.WEAPONS:
        return <WeaponSection data={editData as CustomWeapon} onChange={setEditData} originalId={origId} />;
      case ContentCategory.GEAR_SETS:
        return <GearSetSection data={editData as CustomGearSet} onChange={setEditData} originalId={origId} />;
      case ContentCategory.OPERATORS:
        return <OperatorSection data={editData as CustomOperator} onChange={setEditData} originalId={origId} />;
      case ContentCategory.SKILLS:
        return <SkillSection data={editData as CustomSkill} onChange={setEditData} originalId={origId} />;
      case ContentCategory.WEAPON_EFFECTS:
        return <WeaponEffectSection data={editData as CustomWeaponEffect} onChange={setEditData} originalId={origId} />;
      case ContentCategory.GEAR_EFFECTS:
        return <GearEffectSection data={editData as CustomGearEffect} onChange={setEditData} originalId={origId} />;
      case ContentCategory.OPERATOR_STATUSES:
        return <OperatorStatusSection data={editData as CustomOperatorStatus} onChange={setEditData} originalId={origId} />;
      case ContentCategory.OPERATOR_TALENTS:
        return <OperatorTalentSection data={editData as CustomOperatorTalent} onChange={setEditData} originalId={origId} />;
      default:
        return null;
    }
  };

  const renderViewPanel = () => {
    if (!selectedItem) return null;
    const isCustom = selectedItem.source === 'custom';
    const data = isCustom ? findCustomData(selectedItem.category, selectedItem.id) : null;

    return (
      <div className="uc-view">
        <div className="uc-view-header">
          <div>
            <h3>{selectedItem.name}</h3>
            <span className="uc-view-meta">
              {selectedItem.meta}
              <span className={`uc-source-badge uc-source-badge--${selectedItem.source}`}>
                {selectedItem.source}
              </span>
            </span>
          </div>
          <div className="uc-view-actions">
            {isCustom ? (
              <>
                <button className="btn-save" onClick={() => handleEditItem(selectedItem)}>Edit</button>
                {ASSOCIABLE_CATEGORIES.has(selectedItem.category) && (
                  <button className="btn-next" onClick={() => setShowAssociatePanel((p) => !p)}>
                    {showAssociatePanel ? 'Hide Links' : 'Link to Operator'}
                  </button>
                )}
              </>
            ) : (
              <button className="btn-next" onClick={() => handleCloneItem(selectedItem)}>Clone as Custom</button>
            )}
          </div>
        </div>

        {showAssociatePanel && isCustom && ASSOCIABLE_CATEGORIES.has(selectedItem.category) && (
          <AssociationPanel
            itemId={selectedItem.id}
            category={selectedItem.category}
            operators={allOperators}
            onChanged={bumpLocal}
          />
        )}

        <div className="uc-view-body">
          {data ? (
            <CustomDataView data={data} category={selectedItem.category} />
          ) : (
            <>
              <div className="uc-view-builtin-notice">
                This is a base game item. Clone it to create an editable custom copy.
              </div>
              <BuiltinDataView item={selectedItem} />
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="uc-root">
      <UnifiedCustomizerRail active={entityType} onChange={handleEntityTypeChange} />

      {/* ── Item List (middle column) ──────────────────────────── */}
      <div className="uc-list">
        <div className="uc-list-header">
          <span className="uc-list-title">{CATEGORY_TITLES[entityType]}</span>
          <button className="btn-add-sm" onClick={handleNewItem} title="New custom item">+</button>
        </div>
        <input
          className="uc-list-filter"
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="uc-list-scroll">
          {customItems.length > 0 && (
            <div className="uc-list-group">
              <span className="uc-list-group-label">Custom</span>
              {customItems.map((item) => (
                <button
                  key={item.id}
                  className={`uc-list-item${selectedItem?.id === item.id && selectedItem?.source === item.source ? ' uc-list-item--active' : ''}`}
                  onClick={() => handleSelectItem(item)}
                  onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, item }); }}
                >
                  {item.color && <span className="uc-list-dot" style={{ background: item.color }} />}
                  <span className="uc-list-item-name">{item.name}</span>
                  <span className="uc-list-item-meta">{item.meta}</span>
                </button>
              ))}
            </div>
          )}
          {builtinItems.length > 0 && (
            <div className="uc-list-group">
              <span className="uc-list-group-label">Base</span>
              {builtinItems.map((item) => (
                <button
                  key={item.id}
                  className={`uc-list-item${selectedItem?.id === item.id && selectedItem?.source === item.source ? ' uc-list-item--active' : ''}`}
                  onClick={() => handleSelectItem(item)}
                  onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, item }); }}
                >
                  {item.color && <span className="uc-list-dot" style={{ background: item.color }} />}
                  <span className="uc-list-item-name">{item.name}</span>
                  <span className="uc-list-item-meta">{item.meta}</span>
                </button>
              ))}
            </div>
          )}
          {filteredItems.length === 0 && (
            <div className="uc-list-empty">No items</div>
          )}
        </div>
      </div>

      {/* ── Context menu ─────────────────────────────────────── */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="uc-ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          {ctxMenu.item.source === 'custom' && (
            <>
              <button className="uc-ctx-item" onMouseDown={(e) => { e.stopPropagation(); handleCtxAction('edit'); }}>Edit</button>
              <button className="uc-ctx-item uc-ctx-item--danger" onMouseDown={(e) => { e.stopPropagation(); handleCtxAction('delete'); }}>Delete</button>
            </>
          )}
          {ctxMenu.item.source === 'builtin' && (
            <button className="uc-ctx-item" onMouseDown={(e) => { e.stopPropagation(); handleCtxAction('duplicate'); }}>Duplicate as Custom</button>
          )}
        </div>
      )}

      {/* ── Right panel: View or Edit ─────────────────────────── */}
      <div className="uc-body">
        {panelMode === 'edit' ? (
          <>
            <div className="uc-header">
              <h3>{editOriginalId ? 'Edit' : 'New'} {CATEGORY_TITLES[entityType]?.replace(/s$/, '')}</h3>
            </div>
            <div className="uc-form">
              {renderEditForm()}
            </div>
            {errors.length > 0 && (
              <div className="wizard-errors">
                {errors.map((err, i) => <div key={i} className="wizard-error">{err}</div>)}
              </div>
            )}
            <div className="uc-footer">
              <button className="btn-cancel" onClick={handleCancelEdit}>Cancel</button>
              <button className="btn-save" onClick={handleSave}>Save</button>
            </div>
          </>
        ) : panelMode === 'view' && selectedItem ? (
          renderViewPanel()
        ) : (
          <div className="uc-placeholder">
            <div className="uc-placeholder-text">
              Select an item to view, or click <strong>+</strong> to create a new one
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Panel for associating a custom item with operators. */
function AssociationPanel({ itemId, category, operators, onChanged }: {
  itemId: string;
  category: ContentCategory;
  operators: { id: string; name: string; source: 'builtin' | 'custom' }[];
  onChanged: () => void;
}) {
  const [selectedOpId, setSelectedOpId] = useState('');

  // Only skills have the link table currently
  const isSkill = category === ContentCategory.SKILLS;

  // Get current associations for skills
  const currentLinks = useMemo(() => {
    if (!isSkill) return [];
    // Find which operators are linked to this skill
    const result: { operatorId: string; operatorName: string; skillCategory: string }[] = [];
    for (const op of operators) {
      const links = getLinksForOperator(op.id);
      for (const link of links) {
        if (link.customSkillId === itemId) {
          result.push({ operatorId: op.id, operatorName: op.name, skillCategory: link.skillCategory });
        }
      }
    }
    return result;
  }, [isSkill, itemId, operators]);

  const handleLink = useCallback(() => {
    if (!selectedOpId || !isSkill) return;
    // Default to 'basic' skill category — user can change later
    addSkillLink(selectedOpId, 'basic', itemId);
    setSelectedOpId('');
    onChanged();
  }, [selectedOpId, isSkill, itemId, onChanged]);

  const handleUnlink = useCallback((operatorId: string, skillCategory: string) => {
    if (!isSkill) return;
    removeSkillLink(operatorId, skillCategory as SkillType, itemId);
    onChanged();
  }, [isSkill, itemId, onChanged]);

  return (
    <div className="uc-associate">
      <div className="uc-associate-header">Operator Associations</div>
      {currentLinks.length > 0 && (
        <div className="uc-associate-links">
          {currentLinks.map((link, i) => (
            <div key={i} className="uc-associate-link">
              <span>{link.operatorName} ({link.skillCategory})</span>
              <button className="btn-add-sm" onClick={() => handleUnlink(link.operatorId, link.skillCategory)}>&times;</button>
            </div>
          ))}
        </div>
      )}
      {isSkill && (
        <div className="uc-associate-add">
          <select value={selectedOpId} onChange={(e) => setSelectedOpId(e.target.value)}>
            <option value="">Select operator...</option>
            {operators.map((op) => (
              <option key={op.id} value={op.id}>{op.name}{op.source === 'custom' ? ' (Custom)' : ''}</option>
            ))}
          </select>
          <button className="btn-save" onClick={handleLink} disabled={!selectedOpId}>Link</button>
        </div>
      )}
      {!isSkill && (
        <div className="uc-associate-notice">
          Association for {category.toLowerCase().replace(/_/g, ' ')} is managed via the item's operator ID field.
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function interactionToText(i: Interaction): string {
  const parts: string[] = [];
  parts.push(i.subject.replace(/_/g, ' '));
  if (i.negated) parts.push('NOT');
  parts.push(i.verb.replace(/_/g, ' '));
  parts.push(i.object.replace(/_/g, ' '));
  if (i.objectId) parts.push(`(${i.objectId})`);
  if (i.cardinalityConstraint && i.cardinality != null) parts.push(`${i.cardinalityConstraint.replace(/_/g, ' ')} ${i.cardinality}`);
  return parts.join(' ');
}

function effectToText(e: Effect): string {
  const parts: string[] = [];
  parts.push(e.verb.replace(/_/g, ' '));
  if (e.cardinality != null) parts.push(String(e.cardinality));
  if (e.adjective) {
    const adjs = Array.isArray(e.adjective) ? e.adjective : [e.adjective];
    parts.push(adjs.map((a) => a.replace(/_/g, ' ')).join(' '));
  }
  if (e.object) parts.push(e.object.replace(/_/g, ' '));
  if (e.objectId) parts.push(`(${e.objectId})`);
  if (e.toObject) parts.push(`TO ${String(e.toObject).replace(/_/g, ' ')}`);
  if (e.with) {
    const wpParts: string[] = [];
    for (const [k, v] of Object.entries(e.with)) {
      const leaf = getLeafValue(v);
      const val = typeof leaf === 'number' ? leaf : Array.isArray(leaf) ? `[${leaf.slice(0, 3).join(', ')}...]` : '(expr)';
      wpParts.push(`${k.replace(/_/g, ' ').toUpperCase()} ${val}`);
    }
    if (wpParts.length) parts.push(`WITH ${wpParts.join(', ')}`);
  }
  return parts.join(' ');
}

function Field({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="cv-field">
      <span className="cv-field-label">{label}</span>
      <span className="cv-field-value">{String(value)}</span>
    </div>
  );
}

function GSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cv-section">
      <div className="cv-section-title">{title}</div>
      {children}
    </div>
  );
}

const SKILL_TYPE_LABELS: Record<string, string> = {
  basic: 'Basic Attack', battle: 'Battle Skill', combo: 'Combo Skill', ultimate: 'Ultimate',
};
const SKILL_TYPE_TO_JSON_KEY: Record<string, string> = {
  basic: 'BASIC_ATTACK', battle: 'BATTLE_SKILL', combo: 'COMBO_SKILL', ultimate: 'ULTIMATE',
};
const HIT_NAMES = ['Hit 1', 'Hit 2', 'Hit 3', 'Hit 4', 'Hit 5', 'Hit 6', 'Hit 7', 'Hit 8'];

function starStr(n: number): string { return `${n}\u2605`; }

// ── Custom item views ────────────────────────────────────────────────────────

function CustomDataView({ data, category }: { data: CustomData; category: ContentCategory }) {
  switch (category) {
    case ContentCategory.OPERATORS: return <CustomOperatorView data={data as CustomOperator} />;
    case ContentCategory.WEAPONS: return <CustomWeaponView data={data as CustomWeapon} />;
    case ContentCategory.GEAR_SETS: return <CustomGearSetView data={data as CustomGearSet} />;
    case ContentCategory.SKILLS: return <CustomSkillView data={data as CustomSkill} />;
    case ContentCategory.WEAPON_EFFECTS:
    case ContentCategory.GEAR_EFFECTS:
    case ContentCategory.OPERATOR_STATUSES:
    case ContentCategory.OPERATOR_TALENTS:
      return <CustomGenericView data={data} />;
    default:
      return <pre className="uc-json-view">{JSON.stringify(data, null, 2)}</pre>;
  }
}

function CustomOperatorView({ data }: { data: CustomOperator }) {
  return (
    <>
      <div className="cv-field-grid">
        <Field label="ID" value={data.id} />
        <Field label="Class" value={data.operatorClassType} />
        <Field label="Element" value={data.elementType} />
        <Field label="Weapons" value={data.weaponTypes.map((w) => w.replace(/_/g, ' ')).join(', ')} />
        <Field label="Rarity" value={starStr(data.operatorRarity)} />
      </div>
      <GSection title="Base Stats (Lv1)">
        <div className="cv-field-grid">
          {Object.entries(data.baseStats.lv1).map(([k, v]) => <Field key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
        </div>
      </GSection>
      <GSection title="Base Stats (Lv90)">
        <div className="cv-field-grid">
          {Object.entries(data.baseStats.lv90).map(([k, v]) => <Field key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
        </div>
      </GSection>
      {data.skills && data.skills.length > 0 && (
        <GSection title={`Skills (${data.skills.length})`}>
          {data.skills.map((skill, i) => (
            <div key={i} className="cv-effect-card">
              <div className="cv-effect-name">{skill.name || `Skill ${i + 1}`}</div>
              <div className="cv-skill-type-badge">{skill.combatSkillType.replace(/_/g, ' ')}</div>
              <div className="cv-field-grid">
                {skill.element && <Field label="Element" value={skill.element} />}
                <Field label="Duration" value={`${skill.durationSeconds}s`} />
                {skill.cooldownSeconds != null && <Field label="Cooldown" value={`${skill.cooldownSeconds}s`} />}
              </div>
              {skill.multipliers && skill.multipliers.length > 0 && (
                <div className="cv-buffs">
                  <span className="cv-label">Multipliers:</span>
                  {skill.multipliers.map((m, mi) => (
                    <span key={mi} className="cv-buff-tag">{m.label}: [{m.values.slice(0, 3).join(', ')}...]</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </GSection>
      )}
      <GSection title="Combo Trigger">
        <div className="cv-effect-card">
          <div className="cv-effect-desc">{data.combo.description || '(no description)'}</div>
          {data.combo.windowFrames != null && <Field label="Window" value={`${data.combo.windowFrames}f`} />}
          {data.combo.onTriggerClause.length > 0 && (
            <div className="cv-triggers">
              <span className="cv-label">Conditions:</span>
              {data.combo.onTriggerClause.map((pred, i) => (
                <span key={i}>{pred.conditions?.map((c, ci) => <code key={ci} className="cv-trigger-tag">{interactionToText(c)}</code>)}</span>
              ))}
            </div>
          )}
        </div>
      </GSection>
      {data.potentials && data.potentials.length > 0 && (
        <GSection title="Potentials">
          {data.potentials.map((p, i) => (
            <div key={i} className="cv-talent-level">
              <span className="cv-talent-level-num">P{p.level}</span>
              <span className="cv-talent-level-desc">{p.description}</span>
            </div>
          ))}
        </GSection>
      )}
      {data.statusEvents && data.statusEvents.length > 0 && (
        <GSection title={`Status Events (${data.statusEvents.length})`}>
          {data.statusEvents.map((se, i) => <StatusEventCard key={i} se={se} />)}
        </GSection>
      )}
    </>
  );
}

function CustomWeaponView({ data }: { data: CustomWeapon }) {
  return (
    <>
      <div className="cv-field-grid">
        <Field label="ID" value={data.id} />
        <Field label="Type" value={data.weaponType.replace(/_/g, ' ')} />
        <Field label="Rarity" value={starStr(data.weaponRarity)} />
        <Field label="Base ATK (Lv1)" value={String(data.baseAtk.lv1)} />
        <Field label="Base ATK (Lv90)" value={String(data.baseAtk.lv90)} />
      </div>
      <GSection title={`Skills (${data.skills.length})`}>
        {data.skills.map((skill, i) => (
          <div key={i} className="cv-effect-card">
            <div className="cv-effect-name">{skill.label}</div>
            <div className="cv-skill-type-badge">{skill.type}</div>
            {skill.type === 'STAT_BOOST' && skill.statBoost && (
              <div className="cv-field-grid">
                <Field label="Stat" value={skill.statBoost.stat.replace(/_/g, ' ')} />
                <Field label="Values" value={`[${skill.statBoost.values.join(', ')}]`} />
              </div>
            )}
            {skill.type === 'NAMED' && skill.namedEffect && (
              <>
                <div className="cv-field-grid">
                  <Field label="Effect" value={skill.namedEffect.name} />
                  <Field label="Target" value={skill.namedEffect.target} />
                  <Field label="Duration" value={`${skill.namedEffect.durationSeconds}s`} />
                  <Field label="Max Stacks" value={String(skill.namedEffect.maxStacks)} />
                  {skill.namedEffect.cooldownSeconds != null && <Field label="Cooldown" value={`${skill.namedEffect.cooldownSeconds}s`} />}
                </div>
                {skill.namedEffect.triggers.length > 0 && (
                  <div className="cv-triggers">
                    <span className="cv-label">Triggers:</span>
                    {skill.namedEffect.triggers.map((t, j) => <code key={j} className="cv-trigger-tag">{interactionToText(t)}</code>)}
                  </div>
                )}
                {skill.namedEffect.buffs.length > 0 && (
                  <div className="cv-buffs">
                    <span className="cv-label">Buffs:</span>
                    {skill.namedEffect.buffs.map((b, j) => (
                      <span key={j} className="cv-buff-tag">{b.stat.replace(/_/g, ' ')} {b.valueMin}\u2013{b.valueMax}{b.perStack ? ' /stack' : ''}</span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </GSection>
    </>
  );
}

function CustomGearSetView({ data }: { data: CustomGearSet }) {
  return (
    <>
      <div className="cv-field-grid">
        <Field label="ID" value={data.id} />
        <Field label="Rarity" value={starStr(data.rarity)} />
      </div>
      <GSection title={`Pieces (${data.pieces.length})`}>
        {data.pieces.map((piece, i) => (
          <div key={i} className="cv-subsection">
            <span className="cv-piece-name">{piece.name}</span>
            <span className="cv-piece-meta">{piece.gearCategory} · DEF {piece.defense}</span>
          </div>
        ))}
      </GSection>
      {data.setEffect && (
        <GSection title="Set Effect">
          {data.setEffect.passiveStats && Object.keys(data.setEffect.passiveStats).length > 0 && (
            <div className="cv-field-grid">
              {Object.entries(data.setEffect.passiveStats).map(([k, v]) => <Field key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
            </div>
          )}
          {data.setEffect.effects && data.setEffect.effects.map((eff, i) => (
            <div key={i} className="cv-effect-card">
              <div className="cv-effect-name">{eff.label}</div>
              <div className="cv-field-grid">
                <Field label="Target" value={eff.target} />
                <Field label="Duration" value={`${eff.durationSeconds}s`} />
                <Field label="Max Stacks" value={String(eff.maxStacks)} />
              </div>
              {eff.triggers.length > 0 && (
                <div className="cv-triggers">
                  <span className="cv-label">Triggers:</span>
                  {eff.triggers.map((t, j) => <code key={j} className="cv-trigger-tag">{interactionToText(t)}</code>)}
                </div>
              )}
              {eff.buffs.length > 0 && (
                <div className="cv-buffs">
                  <span className="cv-label">Buffs:</span>
                  {eff.buffs.map((b, j) => (
                    <span key={j} className="cv-buff-tag">{b.stat.replace(/_/g, ' ')} {b.value}{b.perStack ? ' /stack' : ''}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </GSection>
      )}
    </>
  );
}

function CustomSkillView({ data }: { data: CustomSkill }) {
  return (
    <>
      <div className="cv-field-grid">
        <Field label="ID" value={data.id} />
        <Field label="Type" value={data.combatSkillType.replace(/_/g, ' ')} />
        <Field label="Element" value={data.element ?? 'None'} />
        <Field label="Duration" value={`${data.durationSeconds}s`} />
        {data.cooldownSeconds != null && <Field label="Cooldown" value={`${data.cooldownSeconds}s`} />}
        {data.animationSeconds != null && <Field label="Animation" value={`${data.animationSeconds}s`} />}
        {data.timeInteractionType && <Field label="Time Interaction" value={data.timeInteractionType.replace(/_/g, ' ')} />}
      </div>
      {data.description && (
        <GSection title="Description">
          <div className="cv-effect-desc">{data.description}</div>
        </GSection>
      )}
      {data.segments && data.segments.length > 0 && (
        <GSection title={`Segments (${data.segments.length})`}>
          {data.segments.map((seg, i) => (
            <div key={i} className="cv-effect-card">
              <div className="cv-effect-name">{seg.name || `Segment ${i + 1}`}</div>
              <Field label="Duration" value={`${seg.durationSeconds}s`} />
              {seg.stats && seg.stats.length > 0 && (
                <div className="cv-field-grid">
                  {seg.stats.map((s, j) => <Field key={j} label={s.statType.replace(/_/g, ' ')} value={`[${s.value.join(', ')}]`} />)}
                </div>
              )}
            </div>
          ))}
        </GSection>
      )}
      {data.multipliers && data.multipliers.length > 0 && (
        <GSection title={`Multipliers (${data.multipliers.length})`}>
          {data.multipliers.map((m, i) => (
            <div key={i} className="cv-effect-card">
              <div className="cv-effect-name">{m.label}</div>
              <div className="cv-buffs">
                <span className="cv-label">Values (Lv1–{m.values.length}):</span>
                <span className="cv-buff-tag">{m.values.join(', ')}</span>
              </div>
            </div>
          ))}
        </GSection>
      )}
      {data.associationIds && data.associationIds.length > 0 && (
        <GSection title="Linked Operators">
          <div className="cv-triggers">
            {data.associationIds.map((id, i) => <code key={i} className="cv-trigger-tag">{id}</code>)}
          </div>
        </GSection>
      )}
    </>
  );
}

/** Reusable card for a CustomStatusEventDef. */
function StatusEventCard({ se }: { se: CustomStatusEventDef }) {
  return (
    <div className="cv-effect-card">
      <div className="cv-effect-name">{se.name || '(unnamed)'}</div>
      <div className="cv-field-grid">
        <Field label="Target" value={se.target} />
        <Field label="Element" value={se.element} />
        <Field label="Duration" value={`${se.durationValues?.[0] ?? '?'} ${se.durationUnit ?? ''}`} />
        <Field label="Stack" value={`${se.stack?.interactionType} max ${Array.isArray(se.stack?.max) ? se.stack.max[0] : se.stack?.max}`} />
        <Field label="Instances" value={String(se.stack?.instances ?? 1)} />
        {se.isNamedEvent && <Field label="Named" value="Yes" />}
      </div>
      {se.stats && se.stats.length > 0 && (
        <div className="cv-buffs">
          <span className="cv-label">Stats:</span>
          {se.stats.map((s, i) => (
            <span key={i} className="cv-buff-tag">{String(s.statType).replace(/_/g, ' ')} [{(s.value ?? []).join(', ')}]</span>
          ))}
        </div>
      )}
      {se.clause && se.clause.length > 0 && (
        <div className="cv-clause-conditions">
          <span className="cv-label">Clause:</span>
          {se.clause.map((pred, pi) => (
            <div key={pi}>
              {(pred.conditions ?? []).map((c: Interaction, ci: number) => <code key={ci} className="cv-trigger-tag">{interactionToText(c)}</code>)}
              {pred.effects && pred.effects.length > 0 && (
                <>{' → '}{pred.effects.map((e: Effect, ei: number) => <code key={ei} className="cv-trigger-tag">{effectToText(e)}</code>)}</>
              )}
            </div>
          ))}
        </div>
      )}
      {se.onTriggerClause && se.onTriggerClause.length > 0 && (
        <div className="cv-clause-conditions">
          <span className="cv-label">Trigger:</span>
          {se.onTriggerClause.map((pred, pi) => (
            <div key={pi}>
              {(pred.conditions ?? []).map((c: Interaction, ci: number) => <code key={ci} className="cv-trigger-tag">{interactionToText(c)}</code>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomGenericView({ data }: { data: CustomData }) {
  const rec = data as unknown as Record<string, unknown>;
  const seArr = rec.statusEvents as CustomStatusEventDef[] | undefined;
  const seSingle = rec.statusEvent as CustomStatusEventDef | undefined;
  const statusEvents: CustomStatusEventDef[] = seArr ?? (seSingle ? [seSingle] : []);
  const scalarEntries = Object.entries(rec).filter(([k, v]) => k !== 'statusEvents' && k !== 'statusEvent' && k !== 'passiveStats' && typeof v !== 'object');
  const passiveStats = rec.passiveStats ? Object.entries(rec.passiveStats as Record<string, unknown>) : [];

  return (
    <>
      {scalarEntries.length > 0 && (
        <div className="cv-field-grid">
          {scalarEntries.map(([k, v]) => <Field key={k} label={k} value={String(v)} />)}
        </div>
      )}
      {passiveStats.length > 0 && (
        <GSection title="Passive Stats">
          <div className="cv-field-grid">
            {passiveStats.map(([k, v]) => <Field key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
          </div>
        </GSection>
      )}
      {statusEvents.length > 0 && (
        <GSection title={`Status Events (${statusEvents.length})`}>
          {statusEvents.map((se, i) => <StatusEventCard key={i} se={se} />)}
        </GSection>
      )}
    </>
  );
}

// ── Builtin item views ───────────────────────────────────────────────────────

function BuiltinDataView({ item }: { item: ContentBrowserItem }) {
  switch (item.category) {
    case ContentCategory.OPERATORS: return <BuiltinOperatorView id={item.id} />;
    case ContentCategory.WEAPONS: return <BuiltinWeaponView id={item.id} />;
    case ContentCategory.GEAR_SETS: return <BuiltinGearSetView id={item.id} />;
    case ContentCategory.SKILLS: return <BuiltinSkillView id={item.id} />;
    case ContentCategory.WEAPON_EFFECTS: return <BuiltinWeaponEffectView id={item.id} />;
    case ContentCategory.GEAR_EFFECTS: return <BuiltinGearSetView id={item.id.replace(/^gse:/, '')} />;
    case ContentCategory.TALENTS: return <BuiltinTalentView id={item.id} />;
    default: return null;
  }
}

const ELEMENT_COLORS: Record<string, string> = {
  HEAT: '#f08030', ELECTRIC: '#a080f0', CRYO: '#60c8f0',
  NATURE: '#70c050', PHYSICAL: '#c0c0c0', AETHER: '#e0b060',
};

function SkillEntryCard({ entry, accent }: { entry: SkillEntryData; accent: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`cv-effect-card cv-skill-card${expanded ? ' cv-skill-card--expanded' : ''}`}
      style={{ borderLeftColor: accent }}
    >
      <div className="cv-skill-card-header" onClick={() => setExpanded(!expanded)}>
        <div style={{ minWidth: 0 }}>
          <div className="cv-effect-name">{entry.label}</div>
          {entry.subLabel && (
            <div className="cv-skill-type-badge" style={{ marginTop: 2, marginBottom: 0 }}>{entry.subLabel}</div>
          )}
        </div>
        <div className={`cv-skill-card-chevron${expanded ? ' cv-skill-card-chevron--open' : ''}`}>&#9662;</div>
      </div>
      {expanded && (
        <div className="cv-skill-card-body oee">
          <div className="oee-body">
            <SkillEntrySection entry={entry} readOnly defaultOpen />
          </div>
        </div>
      )}
    </div>
  );
}

function BuiltinOperatorSkillSection({ operatorId, skillType, skill }: {
  operatorId: string;
  skillType: SkillType;
  skill: SkillDef;
}) {
  const JSON_KEYS: Record<SkillType, string> = { basic: 'BASIC_ATTACK', battle: 'BATTLE_SKILL', combo: 'COMBO_SKILL', ultimate: 'ULTIMATE' };
  const skillEntries = useMemo(
    () => buildSkillEntries(operatorId, JSON_KEYS[skillType]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [operatorId, skillType],
  );

  const comboTrigger = useMemo(
    () => skillType === 'combo' ? resolveComboTrigger(operatorId) : null,
    [operatorId, skillType],
  );

  const op = ALL_OPERATORS.find((o) => o.id === operatorId);
  const ultEnergy = useMemo(
    () => skillType === 'ultimate' && op ? resolveUltimateEnergy(operatorId, 0, op.ultimateEnergyCost, skill.gaugeGain, skill.teamGaugeGain) : null,
    [operatorId, skillType, op, skill.gaugeGain, skill.teamGaugeGain],
  );

  const accent = (skill.element ? ELEMENT_COLORS[skill.element] : undefined) ?? op?.color ?? 'var(--text-muted)';

  return (
    <GSection title={SKILL_TYPE_LABELS[skillType] ?? skillType}>
      {skill.description && <div className="cv-effect-desc">{skill.description}</div>}

      <div className="cv-field-grid">
        {skill.element && <Field label="Element" value={skill.element} />}
        {(() => {
          const segs = skill.defaultSegments ?? [];
          const totalDur = computeSegmentsSpan(segs);
          const activeSeg = segs.find(s => s.metadata?.segmentType === SegmentType.ACTIVE);
          const cooldownSeg = segs.find(s => s.metadata?.segmentType === SegmentType.COOLDOWN);
          const activeDur = activeSeg?.properties.duration ?? 0;
          const cooldownDur = cooldownSeg?.properties.duration ?? 0;
          const activationDur = totalDur - cooldownDur;
          return (
            <>
              {activationDur > 0 && <Field label="Activation" value={`${fmtN(activationDur / 120)}s`} />}
              {activeDur > 0 && <Field label="Active" value={`${fmtN(activeDur / 120)}s`} />}
              {cooldownDur > 0 && <Field label="Cooldown" value={`${fmtN(cooldownDur / 120)}s`} />}
            </>
          );
        })()}
        {skill.skillPointCost != null && <Field label="SP Cost" value={String(skill.skillPointCost)} />}
      </div>

      {comboTrigger && (
        <div className="cv-effect-card">
          <div className="cv-effect-name" style={{ fontSize: '0.625rem', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Combo Trigger</div>
          <div className="cv-effect-desc">{comboTrigger.description}</div>
          <Field label="Window" value={`${fmtN(comboTrigger.windowSeconds)}s`} />
        </div>
      )}

      {ultEnergy && (
        <div className="cv-effect-card">
          <div className="cv-effect-name" style={{ fontSize: '0.625rem', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Ultimate Energy</div>
          <div className="cv-field-grid">
            <Field label="Energy Cost" value={String(ultEnergy.adjustedCost)} />
            {ultEnergy.gaugeGain != null && ultEnergy.gaugeGain > 0 && <Field label="Gauge Gain" value={String(ultEnergy.gaugeGain)} />}
            {ultEnergy.teamGaugeGain != null && ultEnergy.teamGaugeGain > 0 && <Field label="Team Gauge" value={String(ultEnergy.teamGaugeGain)} />}
          </div>
        </div>
      )}

      {skillEntries.map((entry) => (
        <SkillEntryCard key={entry.id} entry={entry} accent={accent} />
      ))}
    </GSection>
  );
}

function BuiltinOperatorView({ id }: { id: string }) {
  const op = ALL_OPERATORS.find((o) => o.id === id);
  if (!op) return null;

  return (
    <>
      <div className="cv-field-grid">
        <Field label="Rarity" value={starStr(op.rarity)} />
        <Field label="Role" value={op.role} />
        <Field label="Element" value={op.element} />
        <Field label="Weapon Types" value={op.weaponTypes?.join(', ')} />
      </div>

      <GSection title="Talents">
        {[1, 2].map((slot) => {
          const name = slot === 1 ? op.talentOneName : op.talentTwoName;
          const maxLvl = slot === 1 ? op.maxTalentOneLevel : op.maxTalentTwoLevel;
          const descs = op.talentDescriptions?.[slot] ?? [];
          if (!name) return null;
          return (
            <div key={slot} className="cv-effect-card">
              <div className="cv-effect-name">{name}</div>
              <Field label="Max Level" value={String(maxLvl)} />
              {descs.map((desc: string, i: number) => (
                <div key={i} className="cv-talent-level">
                  <span className="cv-talent-level-num">Lv{i + 1}</span>
                  <span className="cv-talent-level-desc">{desc}</span>
                </div>
              ))}
            </div>
          );
        })}
      </GSection>

      {(['basic', 'battle', 'combo', 'ultimate'] as const).map((skillType) => (
        <BuiltinOperatorSkillSection
          key={skillType}
          operatorId={id}
          skillType={skillType}
          skill={op.skills[skillType]}
        />
      ))}

      {op.potentialDescriptions && op.potentialDescriptions.length > 0 && (
        <GSection title="Potentials">
          {op.potentialDescriptions.map((desc: string, i: number) => (
            <div key={i} className="cv-talent-level">
              <span className="cv-talent-level-num">P{i + 1}</span>
              <span className="cv-talent-level-desc">{desc}</span>
            </div>
          ))}
        </GSection>
      )}
    </>
  );
}

function BuiltinWeaponView({ id }: { id: string }) {
  const weaponId = getWeaponIdByName(id);
  const weapon = weaponId ? getWeapon(weaponId) : undefined;
  const dslDefs = getWeaponEffectDefs(id);
  if (!weapon) return null;

  return (
    <>
      <div className="cv-field-grid">
        <Field label="Rarity" value={starStr(weapon.rarity)} />
        <Field label="Type" value={weapon.type.replace(/_/g, ' ')} />
        <Field label="Base ATK (Lv1)" value={String(weapon.getBaseAttack(1))} />
        <Field label="Base ATK (Lv90)" value={String(weapon.getBaseAttack(90))} />
      </div>
      <GSection title="Skills">
        {weapon.skills.map((skill, i) => (
          <Field key={i} label={`Skill ${i + 1}`} value={skill.replace(/_/g, ' ')} />
        ))}
      </GSection>
      {dslDefs.length > 0 && (
        <GSection title="Triggered Effects">
          {dslDefs.map((def, i: number) => (
            <div key={i} className="cv-effect-card">
              <div className="cv-effect-name">{def.label ?? def.name}</div>
              <div className="cv-field-grid">
                <Field label="Target" value={resolveTargetDisplay(def)} />
                <Field label="Duration" value={`${resolveDurationSeconds(def)}s`} />
                <Field label="Max Stacks" value={String(def.stack?.max?.P0 ?? 1)} />
                {(def.cooldownSeconds ?? 0) > 0 && <Field label="Cooldown" value={`${def.cooldownSeconds}s`} />}
              </div>
              {resolveTriggerInteractions(def).length > 0 && (
                <div className="cv-triggers">
                  <span className="cv-label">Triggers:</span>
                  {resolveTriggerInteractions(def).map((t, j: number) => <code key={j} className="cv-trigger-tag">{interactionToText(t)}</code>)}
                </div>
              )}
              {def.buffs && def.buffs.length > 0 && (
                <div className="cv-buffs">
                  <span className="cv-label">Buffs:</span>
                  {def.buffs.map((b, j: number) => (
                    <span key={j} className="cv-buff-tag">{b.stat} {b.valueMin != null ? `${b.valueMin}\u2013${b.valueMax}` : b.value}{b.perStack ? ' /stack' : ''}</span>
                  ))}
                </div>
              )}
              {def.note && <div className="cv-note">{def.note}</div>}
            </div>
          ))}
        </GSection>
      )}
    </>
  );
}

/** Format a stat value: percentages get %, integers stay as-is. */
function formatStatVal(key: string, val: number): string {
  const PCT_STATS = new Set([
    'HEAT_DAMAGE_BONUS', 'NATURE_DAMAGE_BONUS', 'CRYO_DAMAGE_BONUS', 'ELECTRIC_DAMAGE_BONUS',
    'PHYSICAL_DAMAGE_BONUS', 'ARTS_DAMAGE_BONUS', 'SKILL_DAMAGE_BONUS',
    'BASIC_ATTACK_DAMAGE_BONUS', 'BATTLE_SKILL_DAMAGE_BONUS', 'COMBO_SKILL_DAMAGE_BONUS',
    'ULTIMATE_DAMAGE_BONUS', 'CRITICAL_RATE', 'CRITICAL_DAMAGE',
    'ATTACK_BONUS', 'STRENGTH_BONUS', 'AGILITY_BONUS', 'INTELLECT_BONUS', 'WILL_BONUS',
    'HP_BONUS', 'TREATMENT_BONUS', 'FINAL_DAMAGE_REDUCTION',
    'STAGGER_EFFICIENCY_BONUS', 'ULTIMATE_GAIN_EFFICIENCY', 'COMBO_SKILL_COOLDOWN_REDUCTION',
  ]);
  if (PCT_STATS.has(key) || (val > 0 && val < 1)) return `${(val * 100).toFixed(1)}%`;
  if (Number.isInteger(val)) return String(val);
  return val.toFixed(1);
}

const GEAR_CATEGORY_ORDER = [GearCategory.ARMOR, GearCategory.GLOVES, GearCategory.KIT];
const GEAR_CATEGORY_LABELS: Record<string, string> = {
  [GearCategory.ARMOR]: 'Armor',
  [GearCategory.GLOVES]: 'Gloves',
  [GearCategory.KIT]: 'Kit',
};

function GearPieceCard({ piece, icon }: { piece: GearPieceData; icon?: string }) {
  const ranks = Object.keys(piece.allLevels).sort((a, b) => Number(a) - Number(b));
  const statKeys = ranks.length > 0 ? Object.keys(piece.allLevels[ranks[0]]) : [];

  return (
    <div className="gs-piece-card">
      <div className="gs-piece-body">
        {icon && (
          <div className="gs-piece-icon-wrap">
            <img className="gs-piece-icon" src={icon} alt={piece.name} />
          </div>
        )}
        <div className="gs-piece-info">
          <div className="gs-piece-header">
            <div className="gs-piece-name">{piece.name}</div>
          </div>
          <div className="gs-piece-meta">DEF {piece.defense}</div>
          {statKeys.length > 0 && (
            <div className="gs-piece-stats">
              <div className="gs-piece-stat-row gs-piece-stat-header">
                <span className="gs-piece-stat-name" />
                <span className="gs-piece-stat-vals">
                  {ranks.map((r) => <span key={r} className="gs-rank-label">R{r}</span>)}
                </span>
              </div>
              {statKeys.map((stat) => (
                <div key={stat} className="gs-piece-stat-row">
                  <span className="gs-piece-stat-name">{stat.replace(/_/g, ' ')}</span>
                  <span className="gs-piece-stat-vals">
                    {ranks.map((r, ri) => (
                      <span key={r} className={ri === ranks.length - 1 ? 'gs-piece-stat-max' : ''}>
                        {formatStatVal(stat, piece.allLevels[r][stat])}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const GEAR_TAB_ABBREV: Record<string, string> = {
  [GearCategory.ARMOR]: 'ARM',
  [GearCategory.GLOVES]: 'GLV',
  [GearCategory.KIT]: 'KIT',
};

function BuiltinGearSetView({ id }: { id: string }) {
  const gearSetData = getGearSetData(id);
  const registryPieces = getGearPiecesBySet(id);
  const passiveEntry = getGearSetEffects(id as GearSetType);
  const dslDefs = getGearEffectDefs(id);
  const [activeTab, setActiveTab] = useState<string>(GearCategory.ARMOR);

  // Convert vertical wheel to horizontal scroll in the pieces area
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY || e.deltaX });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [activeTab]);

  if (registryPieces.length === 0 && !gearSetData) return null;

  const pieces = [...(gearSetData?.pieces ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const piecesByCategory: Record<string, GearPieceData[]> = {};
  for (const p of pieces) {
    if (!piecesByCategory[p.gearCategory]) piecesByCategory[p.gearCategory] = [];
    piecesByCategory[p.gearCategory].push(p);
  }

  // Build icon lookup from registry
  const iconMap: Record<string, string | undefined> = {};
  for (const rp of registryPieces) {
    iconMap[rp.name] = rp.icon;
  }

  const hasPassive = passiveEntry && Object.keys(passiveEntry.passiveStats).length > 0;
  const hasTriggered = dslDefs.length > 0;
  const setDesc = gearSetData?.setEffect?.description;
  const activePieces = piecesByCategory[activeTab] ?? [];

  return (
    <div className="gs-root">
      {/* ── Set Effect Section ───────────────────────────────────── */}
      {(hasPassive || hasTriggered || setDesc) && (
        <div className="gs-effect-section">
          <div className="gs-section-label">Set Effect <span className="gs-section-badge">{gearSetData?.setEffect?.piecesRequired ?? 3}-Piece</span></div>

          {setDesc && (
            <div className="gs-set-desc">{setDesc}</div>
          )}

          {hasPassive && (
            <div className="gs-passive-block">
              <div className="gs-passive-label">Permanent Stats</div>
              <div className="gs-passive-stats">
                {Object.entries(passiveEntry!.passiveStats).map(([stat, val]) => (
                  <div key={stat} className="gs-passive-stat">
                    <span className="gs-passive-stat-name">{stat.replace(/_/g, ' ')}</span>
                    <span className="gs-passive-stat-val">+{formatStatVal(stat, val as number)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasTriggered && (
            <div className="gs-triggered-block">
              <div className="gs-passive-label">Triggered Effects</div>
              {dslDefs.map((def, i: number) => (
                <div key={i} className="gs-trigger-card">
                  <div className="gs-trigger-name">{def.label ?? def.name}</div>
                  <div className="gs-trigger-meta">
                    <span className="gs-trigger-tag">{resolveTargetDisplay(def)}</span>
                    <span className="gs-trigger-tag">{resolveDurationSeconds(def)}s</span>
                    {(def.stack?.max?.P0 ?? 1) > 1 && <span className="gs-trigger-tag">max {def.stack?.max?.P0} stacks</span>}
                  </div>
                  {resolveTriggerInteractions(def).length > 0 && (
                    <div className="cv-triggers">
                      <span className="cv-label">When:</span>
                      {resolveTriggerInteractions(def).map((t, j: number) => <code key={j} className="cv-trigger-tag">{interactionToText(t)}</code>)}
                    </div>
                  )}
                  {def.clause && def.clause.length > 0 && (
                    <div className="cv-triggers">
                      <span className="cv-label">Effect:</span>
                      {def.clause.flatMap((c, ci) =>
                        (c.effects ?? []).map((e, ei) => (
                          <code key={`${ci}-${ei}`} className="cv-trigger-tag">{effectToText(e as unknown as Effect)}</code>
                        ))
                      )}
                    </div>
                  )}
                  {def.buffs && def.buffs.length > 0 && (
                    <div className="cv-buffs">
                      <span className="cv-label">Buffs:</span>
                      {def.buffs.map((b, j: number) => (
                        <span key={j} className="cv-buff-tag">{b.stat.replace(/_/g, ' ')} +{b.value}{b.perStack ? ' /stack' : ''}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Rail + Horizontal Scroll ─────────────────────────── */}
      <div className="gs-pieces-area">
        <div className="gs-tab-rail">
          {GEAR_CATEGORY_ORDER.map((cat) => {
            const count = piecesByCategory[cat]?.length ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                className={`gs-tab-btn${activeTab === cat ? ' gs-tab-btn--active' : ''}`}
                onClick={() => setActiveTab(cat)}
                title={GEAR_CATEGORY_LABELS[cat]}
              >
                <span className="gs-tab-abbrev">{GEAR_TAB_ABBREV[cat]}</span>
                <span className="gs-tab-count">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="gs-scroll-area" ref={scrollRef}>
          {activePieces.map((p) => (
            <GearPieceCard key={p.gearType} piece={p} icon={iconMap[p.name]} />
          ))}
        </div>
      </div>
    </div>
  );
}

function BuiltinSkillView({ id }: { id: string }) {
  const parts = id.split(':');
  if (parts.length < 3) return null;
  const opId = parts[1];
  const skillType = parts[2] as SkillType;
  const op = ALL_OPERATORS.find((o) => o.id === opId);
  if (!op) return null;
  const skill = op.skills?.[skillType];
  if (!skill) return null;

  const opJson = getOperatorJson(opId);
  const jsonKey = SKILL_TYPE_TO_JSON_KEY[skillType];
  const skillsMap = opJson?.skills as Record<string, Record<string, unknown>> | undefined;
  const skillJson = skillsMap?.[jsonKey];

  // Variants
  const variants: { key: string; data: Record<string, unknown> }[] = [];
  if (skillsMap) {
    for (const [k, v] of Object.entries(skillsMap)) {
      if (k !== jsonKey && k.includes(jsonKey)) variants.push({ key: k, data: v });
    }
  }

  const hasSegments = skillJson?.segments && Array.isArray(skillJson.segments) && skillJson.segments.length > 0;
  const hasFrames = skillJson?.frames && Array.isArray(skillJson.frames) && skillJson.frames.length > 0;
  const statusEvents = (opJson?.statusEvents ?? []) as Record<string, unknown>[];

  return (
    <>
      <div className="cv-skill-type-badge">{SKILL_TYPE_LABELS[skillType] ?? skillType}</div>
      <div className="cv-field-grid" style={{ marginTop: '0.5rem' }}>
        <Field label="Operator" value={op.name} />
        <Field label="Skill Key" value={skill.name} />
        {skill.element && <Field label="Element" value={skill.element} />}
      </div>
      {skill.description && (
        <GSection title="Description">
          <div className="cv-effect-desc">{skill.description}</div>
        </GSection>
      )}
      <GSection title="Timings">
        <div className="cv-field-grid">
          {(() => {
            const segs = skill.defaultSegments ?? [];
            const totalDur = computeSegmentsSpan(segs);
            const activeSeg = segs.find(s => s.metadata?.segmentType === SegmentType.ACTIVE);
            const cooldownSeg = segs.find(s => s.metadata?.segmentType === SegmentType.COOLDOWN);
            const activeDur = activeSeg?.properties.duration ?? 0;
            const cooldownDur = cooldownSeg?.properties.duration ?? 0;
            const activationDur = totalDur - cooldownDur;
            return (
              <>
                <Field label="Activation" value={`${activationDur}f (${(activationDur / 120).toFixed(2)}s)`} />
                <Field label="Active" value={`${activeDur}f (${(activeDur / 120).toFixed(2)}s)`} />
                <Field label="Cooldown" value={`${cooldownDur}f (${(cooldownDur / 120).toFixed(2)}s)`} />
              </>
            );
          })()}
        </div>
      </GSection>
      <GSection title="Resources">
        <div className="cv-field-grid">
          {skill.skillPointCost != null && <Field label="SP Cost" value={String(skill.skillPointCost)} />}
          {skill.gaugeGain != null && <Field label="Gauge Gain" value={String(skill.gaugeGain)} />}
          {skill.teamGaugeGain != null && <Field label="Team Gauge" value={String(skill.teamGaugeGain)} />}
        </div>
      </GSection>

      {hasSegments && (
        <GSection title="Combo Chain">
          {(skillJson!.segments as Record<string, unknown>[]).map((seg, si) => {
            const dur = seg.duration as { value: number; unit: string } | undefined;
            const durVal = dur?.value ?? 0;
            const durStr = dur ? `${durVal}${dur.unit === 'FRAME' ? 'f' : 's'}` : '';
            const frames = (seg.frames ?? []) as Record<string, unknown>[];
            const effects: Effect[] = ((seg.clause ?? []) as Predicate[]).flatMap((p: Predicate) => p.effects ?? []);
            const stats = (seg.stats ?? []) as { statType: string; value: number | number[] }[];
            const segName = seg.name ? String(seg.name) : (si < HIT_NAMES.length ? HIT_NAMES[si] : `Hit ${si + 1}`);
            return (
              <div key={si} className="cv-chain-segment">
                <div className="cv-chain-segment-header">
                  <span className="cv-chain-segment-name">{segName}</span>
                  <span className="cv-chain-segment-meta">
                    {durVal > 0 && <span className="cv-chain-dur">{durStr}</span>}
                    {frames.length > 0 && <span className="cv-chain-hits">{frames.length} hit{frames.length > 1 ? 's' : ''}</span>}
                  </span>
                </div>
                {effects.length > 0 && (
                  <div className="cv-chain-segment-effects">
                    {effects.map((e, i) => <code key={i} className="cv-trigger-tag">{effectToText(e)}</code>)}
                  </div>
                )}
                {stats.length > 0 && (
                  <div className="cv-field-grid cv-chain-stats">
                    {stats.map((s, i) => <Field key={i} label={s.statType} value={Array.isArray(s.value) ? s.value.join(', ') : String(s.value)} />)}
                  </div>
                )}
                {frames.length > 0 && (
                  <div className="cv-chain-frames">
                    {frames.map((f, fi) => {
                      const offset = f.offset as { value: number; unit: string } | undefined;
                      const offsetStr = offset ? `${offset.value}${offset.unit === 'FRAME' ? 'f' : 's'}` : '0';
                      return (
                        <div key={fi} className="cv-frame-card">
                          <div className="cv-frame-header">
                            <span className="cv-frame-offset">@{offsetStr}</span>
                            {frames.length > 1 && <span className="cv-frame-index">#{fi + 1}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </GSection>
      )}

      {hasFrames && !hasSegments && (
        <GSection title="Frame Data">
          <div className="cv-frame-timeline">
            {(skillJson!.frames as Record<string, unknown>[]).map((frame, fi) => {
              const offset = frame.offset as { value: number; unit: string } | undefined;
              const offsetStr = offset ? `${offset.value}${offset.unit === 'FRAME' ? 'f' : 's'}` : '0';
              const fEffects: Effect[] = ((frame.clause ?? []) as Predicate[]).flatMap((p: Predicate) => p.effects ?? []);
              return (
                <div key={fi} className="cv-frame-card">
                  <div className="cv-frame-header">
                    <span className="cv-frame-offset">@{offsetStr}</span>
                    <span className="cv-frame-index">#{fi + 1}</span>
                  </div>
                  {fEffects.length > 0 && (
                    <div className="cv-frame-effects">
                      {fEffects.map((e, i) => <code key={i} className="cv-trigger-tag">{effectToText(e)}</code>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </GSection>
      )}

      {variants.length > 0 && (
        <GSection title="Variants">
          {variants.map((v) => {
            const vEffects: Effect[] = ((v.data.clause ?? []) as Predicate[]).flatMap((p: Predicate) => p.effects ?? []);
            return (
              <div key={v.key} className="cv-variant-card">
                <div className="cv-variant-header">{v.key.replace(/_/g, ' ')}</div>
                {vEffects.length > 0 && (
                  <div className="cv-triggers">
                    <span className="cv-label">Effects:</span>
                    {vEffects.map((e, i) => <code key={i} className="cv-trigger-tag">{effectToText(e)}</code>)}
                  </div>
                )}
              </div>
            );
          })}
        </GSection>
      )}

      {statusEvents.length > 0 && (
        <GSection title="Operator Status Events">
          {statusEvents.map((se, i) => {
            const props = se.properties as Record<string, unknown> | undefined;
            const dur = (se.duration ?? props?.duration) as { value: number | number[]; unit: string } | undefined;
            const durStr = dur ? (Array.isArray(dur.value) ? dur.value.join(', ') : dur.value) + (dur.unit === 'FRAME' ? 'f' : 's') : '';
            return (
              <div key={i} className="cv-effect-card">
                <div className="cv-effect-name">{String(se.id)}</div>
                <div className="cv-field-grid">
                  <Field label="Target" value={String(se.target ?? '').replace(/_/g, ' ')} />
                  <Field label="Element" value={String(se.element ?? 'NONE')} />
                  {durStr && <Field label="Duration" value={durStr} />}
                </div>
              </div>
            );
          })}
        </GSection>
      )}
    </>
  );
}

function BuiltinWeaponEffectView({ id }: { id: string }) {
  const weaponName = id.replace(/^wse:/, '');
  const defs = getWeaponEffectDefs(weaponName);
  if (defs.length === 0) return null;

  return (
    <>
      {defs.map((def, i: number) => (
        <div key={i} className="cv-effect-card">
          <div className="cv-effect-name">{def.label ?? def.name}</div>
          <div className="cv-field-grid">
            <Field label="Target" value={resolveTargetDisplay(def)} />
            <Field label="Duration" value={`${resolveDurationSeconds(def)}s`} />
            <Field label="Max Stacks" value={String(def.stack?.max?.P0 ?? 1)} />
            {(def.cooldownSeconds ?? 0) > 0 && <Field label="Cooldown" value={`${def.cooldownSeconds}s`} />}
          </div>
          {resolveTriggerInteractions(def).length > 0 && (
            <div className="cv-triggers">
              <span className="cv-label">Triggers:</span>
              {resolveTriggerInteractions(def).map((t, j: number) => <code key={j} className="cv-trigger-tag">{interactionToText(t)}</code>)}
            </div>
          )}
          {def.buffs && def.buffs.length > 0 && (
            <div className="cv-buffs">
              <span className="cv-label">Buffs:</span>
              {def.buffs.map((b, j: number) => (
                <span key={j} className="cv-buff-tag">{b.stat} {b.valueMin != null ? `${b.valueMin}\u2013${b.valueMax}` : b.value}{b.perStack ? ' /stack' : ''}</span>
              ))}
            </div>
          )}
          {def.note && <div className="cv-note">{def.note}</div>}
        </div>
      ))}
    </>
  );
}

function BuiltinTalentView({ id }: { id: string }) {
  const parts = id.split(':');
  if (parts.length < 3) return null;
  const opId = parts[1];
  const slot = parseInt(parts[2], 10);
  const op = ALL_OPERATORS.find((o) => o.id === opId);
  if (!op) return null;

  const maxLevel = slot === 1 ? op.maxTalentOneLevel : op.maxTalentTwoLevel;
  const descriptions = op.talentDescriptions?.[slot] ?? [];

  return (
    <>
      <div className="cv-field-grid">
        <Field label="Operator" value={op.name} />
        <Field label="Slot" value={`Talent ${slot}`} />
        <Field label="Max Level" value={String(maxLevel)} />
      </div>
      {descriptions.length > 0 && (
        <GSection title="Level Descriptions">
          {descriptions.map((desc: string, i: number) => (
            <div key={i} className="cv-talent-level">
              <span className="cv-talent-level-num">Lv{i + 1}</span>
              <span className="cv-talent-level-desc">{desc}</span>
            </div>
          ))}
        </GSection>
      )}
    </>
  );
}
