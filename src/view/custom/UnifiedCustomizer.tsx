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
import { getGearPiecesBySet, getWeapon, getWeaponIdByName, getWeaponEffectDefs, getGearEffectDefs, resolveTargetDisplay, resolveDurationSeconds, resolveTriggerInteractions, getGenericWeaponSkill, getNamedWeaponSkill } from '../../controller/gameDataStore';
import { getGearSetData, getGearSetEffect } from '../../controller/gameDataStore';
import type { GearPieceData } from '../../controller/gameDataStore';
import { getGearSetEffects } from '../../consts/gearSetEffects';
import { GearSetType, GearCategory, SegmentType, ELEMENT_COLORS, ElementType } from '../../consts/enums';
import type { SkillType, SkillDef, EventSegmentData, EventFrameMarker, TimelineEvent } from '../../consts/viewTypes';
import { computeSegmentsSpan } from '../../consts/viewTypes';
import { THRESHOLD_MAX } from '../../dsl/semantics';
import type { Interaction, Effect, Predicate } from '../../dsl/semantics';
import { getLeafValue } from '../../controller/calculation/valueResolver';
import { operatorToCustomOperator, weaponToCustomWeapon, gearSetToCustomGearSet } from '../../controller/custom/builtinToCustomConverter';
import { getOperatorBase, getOperatorSkill, getOperatorSkills, getOperatorStatuses, getSkillTypeMap as getTypedSkillTypeMap } from '../../controller/gameDataStore';
import { resolveComboTrigger, resolveUltimateEnergy } from '../../controller/info-pane/loadoutPaneController';
import { buildSkillEntries } from './OperatorEventEditor';
import EventBlock from '../EventBlock';
import type { JsonSkillData } from './OperatorEventEditor';
import ClauseEditor from './ClauseEditor';
import { fmtN } from '../../utils/timeline';
import type { CustomStatusEventDef } from '../../model/custom/customStatusEventTypes';
import { t } from '../../locales/locale';
import UnifiedCustomizerRail from './UnifiedCustomizerRail';
import WeaponSection from './sections/WeaponSection';
import GearSetSection from './sections/GearSetSection';
import OperatorSection from './sections/OperatorSection';
import SkillSection from './sections/SkillSection';
import WeaponEffectSection from './sections/WeaponEffectSection';
import GearEffectSection from './sections/GearEffectSection';
import OperatorStatusSection from './sections/OperatorStatusSection';
import OperatorTalentSection from './sections/OperatorTalentSection';

// Auto-discover skill icons
const skillIconContext = require.context('../../assets/skills', false, /\.(png|webp)$/);
const SKILL_ICONS: Record<string, string> = {};
for (const key of skillIconContext.keys()) {
  SKILL_ICONS[key.replace('./', 'skills/')] = skillIconContext(key);
}

const CATEGORY_TITLES: Partial<Record<ContentCategory, string>> = {
  [ContentCategory.OPERATORS]: t('customizer.category.operators'),
  [ContentCategory.WEAPONS]: t('customizer.category.weapons'),
  [ContentCategory.GEAR_SETS]: t('customizer.category.gearSets'),
  [ContentCategory.SKILLS]: t('customizer.category.skills'),
  [ContentCategory.WEAPON_EFFECTS]: t('customizer.category.weaponEffects'),
  [ContentCategory.OPERATOR_STATUSES]: t('customizer.category.operatorStatuses'),
  [ContentCategory.OPERATOR_TALENTS]: t('customizer.category.operatorTalents'),
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

// PanelMode removed — edit uses modal overlay

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
  // panelMode removed — edit uses modal now
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

  const [modalEditOpen, setModalEditOpen] = useState(!!initial);

  const handleEditItem = useCallback((item: ContentBrowserItem) => {
    if (item.source !== 'custom') return;
    const data = findCustomData(item.category, item.id);
    if (!data) return;
    setEditData(JSON.parse(JSON.stringify(data)));
    setEditOriginalId(item.id);
    setModalEditOpen(true);
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
      void 0 /* panel reset */;
    }
    bumpLocal();
  }, [selectedItem, bumpLocal]);

  const handleCloneItem = useCallback((item: ContentBrowserItem) => {
    // For builtins: use converters to populate all fields from source data.
    // For custom: deep-copy the existing custom data.
    let data: CustomData | null = null;

    if (item.source === 'custom') {
      const existing = findCustomData(item.category, item.id);
      if (existing) data = JSON.parse(JSON.stringify(existing));
    } else {
      switch (item.category) {
        case ContentCategory.OPERATORS:
          data = operatorToCustomOperator(item.id);
          break;
        case ContentCategory.WEAPONS:
          data = weaponToCustomWeapon(item.id);
          break;
        case ContentCategory.GEAR_SETS:
          data = gearSetToCustomGearSet(item.id as GearSetType);
          break;
        default:
          data = getDefaultData(item.category);
      }
    }

    if (!data) data = getDefaultData(item.category);
    if (!data) return;

    (data as { name: string }).name = `${item.name} (Clone)`;
    (data as { id: string }).id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setEditData(data);
    setEditOriginalId(undefined);
    setModalEditOpen(true);
    setErrors([]);
  }, []);

  const handleCtxAction = useCallback((action: 'delete' | 'duplicate' | 'edit') => {
    if (!ctxMenu) return;
    const item = ctxMenu.item;
    setCtxMenu(null);
    if (action === 'edit' && item.source === 'custom') {
      handleEditItem(item);
    } else if (action === 'delete' && item.source === 'custom') {
      handleDeleteCustomItem(item);
    } else if (action === 'duplicate') {
      handleCloneItem(item);
    }
  }, [ctxMenu, handleDeleteCustomItem, handleEditItem, handleCloneItem]);

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
    setEditData(null);
    setErrors([]);
    setFilter('');
  }, []);

  const handleSelectItem = useCallback((item: ContentBrowserItem) => {
    setSelectedItem(item);
    setEditData(null);
    setErrors([]);
    setShowAssociatePanel(false);
  }, []);

  const handleNewItem = useCallback(() => {
    const data = getDefaultData(entityType);
    setEditData(data);
    setEditOriginalId(undefined);
    setModalEditOpen(true);
    setSelectedItem(null);
    setErrors([]);
  }, [entityType]);

  const handleSave = useCallback(() => {
    if (!editData) return;
    const result = onSave(entityType, editData);
    if (result.length > 0) {
      setErrors(result);
      return;
    }
    setErrors([]);
    setModalEditOpen(false);
    setEditData(null);
    setSelectedItem(null);
    bumpLocal();
  }, [entityType, editData, onSave, bumpLocal]);

  const handleCancelEdit = useCallback(() => {
    setModalEditOpen(false);
    setEditData(null);
    setErrors([]);
  }, []);

  // Operator list for association
  const allOperators = useMemo(() => {
    const builtins = ALL_OPERATORS.map((op) => ({ id: op.id, name: op.name, source: 'builtin' as const }));
    const customs = getCustomOperators().map((op) => ({ id: `custom_${op.id}`, name: op.name, source: 'custom' as const }));
    return [...builtins, ...customs];
  }, [localRefreshKey, contentRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderEditForm = () => {
    if (!editData) return null;
    return renderSectionForm(editData, entityType, setEditData, editOriginalId);
  };

  /** Render the section form for any category. Used by both view (noop onChange) and edit (real onChange). */
  const renderSectionForm = (data: CustomData, category: ContentCategory, onChange: (d: CustomData) => void, origId?: string) => {
    switch (category) {
      case ContentCategory.OPERATORS:
        return <OperatorSection data={data as CustomOperator} onChange={onChange} originalId={origId} />;
      case ContentCategory.WEAPONS:
        return <WeaponSection data={data as CustomWeapon} onChange={onChange} originalId={origId} />;
      case ContentCategory.GEAR_SETS:
        return <GearSetSection data={data as CustomGearSet} onChange={onChange} originalId={origId} />;
      case ContentCategory.SKILLS:
        return <SkillSection data={data as CustomSkill} onChange={onChange} originalId={origId} />;
      case ContentCategory.WEAPON_EFFECTS:
        return <WeaponEffectSection data={data as CustomWeaponEffect} onChange={onChange} originalId={origId} />;
      case ContentCategory.GEAR_EFFECTS:
        return <GearEffectSection data={data as CustomGearEffect} onChange={onChange} originalId={origId} />;
      case ContentCategory.OPERATOR_STATUSES:
        return <OperatorStatusSection data={data as CustomOperatorStatus} onChange={onChange} originalId={origId} />;
      case ContentCategory.OPERATOR_TALENTS:
        return <OperatorTalentSection data={data as CustomOperatorTalent} onChange={onChange} originalId={origId} />;
      default:
        return null;
    }
  };

  const noop = useCallback(() => {}, []);

  const renderViewPanel = () => {
    if (!selectedItem) return null;
    const isCustom = selectedItem.source === 'custom';
    const customData: CustomData | null | undefined = isCustom
      ? findCustomData(selectedItem.category, selectedItem.id)
      : null;

    return (
      <div className="uc-view">
        <div className="ev-view-header">
          <div className="ev-view-identity">
            <span className="ev-view-name">{selectedItem.name}</span>
            <span className="ev-view-meta">{selectedItem.meta}</span>
            <span className={`uc-source-badge uc-source-badge--${selectedItem.source}`}>{selectedItem.source}</span>
          </div>
          <div className="ev-view-actions">
            {isCustom ? (
              <button className="ev-nav-btn ev-action-btn" onClick={() => handleEditItem(selectedItem)}>Edit</button>
            ) : (
              <button className="ev-nav-btn ev-action-btn" onClick={() => handleCloneItem(selectedItem)}>Customize</button>
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
          {customData ? (
            <div className="ev-readonly">
              {renderSectionForm(customData, selectedItem.category, noop)}
            </div>
          ) : (
            <div className="ev-readonly">
              <BuiltinDataView item={selectedItem} />
            </div>
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
          placeholder={t('customizer.filter.placeholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="uc-list-scroll">
          {customItems.length > 0 && (
            <div className="uc-list-group">
              <span className="uc-list-group-label">{t('customizer.section.custom')}</span>
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
              <span className="uc-list-group-label">{t('customizer.section.builtin')}</span>
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
              <button className="uc-ctx-item" onMouseDown={(e) => { e.stopPropagation(); handleCtxAction('edit'); }}>{t('customizer.ctx.edit')}</button>
              <button className="uc-ctx-item uc-ctx-item--danger" onMouseDown={(e) => { e.stopPropagation(); handleCtxAction('delete'); }}>{t('customizer.ctx.delete')}</button>
            </>
          )}
          {ctxMenu.item.source === 'builtin' && (
            <button className="uc-ctx-item" onMouseDown={(e) => { e.stopPropagation(); handleCtxAction('duplicate'); }}>{t('customizer.ctx.duplicate')}</button>
          )}
        </div>
      )}

      {/* ── Right panel: View or Edit ─────────────────────────── */}
      <div className="uc-body">
        {modalEditOpen && editData ? (
          /* ── Edit panel (replaces right panel content) ──────────── */
          <>
            <div className="ev-view-header">
              <div className="ev-view-identity">
                <span className="ev-view-name">{editOriginalId ? 'Edit' : 'New'} {CATEGORY_TITLES[entityType]?.replace(/s$/, '')}</span>
              </div>
              <div className="ev-view-actions">
                <button className="expr-btn expr-btn--cancel" onClick={handleCancelEdit}>{t('customizer.btn.cancel')}</button>
                <button className="expr-btn expr-btn--apply" onClick={handleSave}>{t('customizer.btn.save')}</button>
              </div>
            </div>
            <div className="uc-edit-body">
              {renderEditForm()}
              {errors.length > 0 && (
                <div className="wizard-errors">
                  {errors.map((err, i) => <div key={i} className="wizard-error">{err}</div>)}
                </div>
              )}
            </div>
          </>
        ) : selectedItem ? (
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
  if (i.cardinalityConstraint && i.value != null) parts.push(`${i.cardinalityConstraint.replace(/_/g, ' ')} ${typeof i.value === 'object' && 'value' in i.value ? i.value.value : i.value}`);
  return parts.join(' ');
}

function effectToText(e: Effect): string {
  const parts: string[] = [];
  parts.push(e.verb.replace(/_/g, ' '));
  if (e.value != null) parts.push(e.value === THRESHOLD_MAX ? 'MAX' : (typeof e.value === 'object' && 'value' in e.value ? String(e.value.value) : String(e.value)));
  if (e.adjective) {
    const adjs = Array.isArray(e.adjective) ? e.adjective : [e.adjective];
    parts.push(adjs.map((a) => a.replace(/_/g, ' ')).join(' '));
  }
  if (e.object) parts.push(e.object.replace(/_/g, ' '));
  if (e.objectId) parts.push(`(${e.objectId})`);
  if (e.to) parts.push(`TO ${String(e.to).replace(/_/g, ' ')}`);
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
    <div className="ev-row">
      <span className="ev-row-label">{label}</span>
      <div className="ev-row-controls">
        <span className="ev-field-value">{String(value)}</span>
      </div>
    </div>
  );
}

function GSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div className="ev-subtitle">{title}</div>
      {children}
    </>
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      <div className="ev-field-grid">
        <Field label="ID" value={data.id} />
        <Field label="Class" value={data.operatorClassType} />
        <Field label="Element" value={data.elementType} />
        <Field label="Weapons" value={data.weaponTypes.map((w) => w.replace(/_/g, ' ')).join(', ')} />
        <Field label="Rarity" value={starStr(data.operatorRarity)} />
      </div>
      <GSection title="Base Stats (Lv1)">
        <div className="ev-field-grid">
          {Object.entries(data.baseStats.lv1).map(([k, v]) => <Field key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
        </div>
      </GSection>
      <GSection title="Base Stats (Lv90)">
        <div className="ev-field-grid">
          {Object.entries(data.baseStats.lv90).map(([k, v]) => <Field key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
        </div>
      </GSection>
      {data.skills && data.skills.length > 0 && (
        <GSection title={`Skills (${data.skills.length})`}>
          {data.skills.map((skill, i) => (
            <div key={i} className="ev-item-card">
              <div className="ev-item-name">{skill.name || `Skill ${i + 1}`}</div>
              <div className="ev-type-badge">{skill.combatSkillType.replace(/_/g, ' ')}</div>
              <div className="ev-field-grid">
                {skill.element && <Field label="Element" value={skill.element} />}
                <Field label="Duration" value={`${skill.durationSeconds}s`} />
                {skill.cooldownSeconds != null && <Field label="Cooldown" value={`${skill.cooldownSeconds}s`} />}
              </div>
              {skill.multipliers && skill.multipliers.length > 0 && (
                <div className="ev-buffs">
                  <span className="ev-inline-label">Multipliers:</span>
                  {skill.multipliers.map((m, mi) => (
                    <span key={mi} className="ev-stat-tag">{m.label}: [{m.values.slice(0, 3).join(', ')}...]</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </GSection>
      )}
      <GSection title="Combo Trigger">
        <div className="ev-item-card">
          <div className="ev-item-desc">{data.combo.description || '(no description)'}</div>
          {data.combo.windowFrames != null && <Field label="Window" value={`${data.combo.windowFrames}f`} />}
          {data.combo.onTriggerClause.length > 0 && (
            <div className="ev-triggers">
              <span className="ev-inline-label">Conditions:</span>
              {data.combo.onTriggerClause.map((pred, i) => (
                <span key={i}>{pred.conditions?.map((c, ci) => <code key={ci} className="ev-code-tag">{interactionToText(c)}</code>)}</span>
              ))}
            </div>
          )}
        </div>
      </GSection>
      {data.potentials && data.potentials.length > 0 && (
        <GSection title="Potentials">
          {data.potentials.map((p, i) => (
            <div key={i} className="ev-potential-row">
              <span className="ev-potential-num">P{p.level}</span>
              <span className="ev-potential-desc">{p.description}</span>
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
      <div className="ev-field-grid">
        <Field label="ID" value={data.id} />
        <Field label="Type" value={data.weaponType.replace(/_/g, ' ')} />
        <Field label="Rarity" value={starStr(data.weaponRarity)} />
        <Field label="Base ATK (Lv1)" value={String(data.baseAtk.lv1)} />
        <Field label="Base ATK (Lv90)" value={String(data.baseAtk.lv90)} />
      </div>
      <GSection title={`Skills (${data.skills.length})`}>
        {data.skills.map((skill, i) => (
          <div key={i} className="ev-item-card">
            <div className="ev-item-name">{skill.label}</div>
            <div className="ev-type-badge">{skill.type}</div>
            {skill.type === 'STAT_BOOST' && skill.statBoost && (
              <div className="ev-field-grid">
                <Field label="Stat" value={skill.statBoost.stat.replace(/_/g, ' ')} />
                <Field label="Values" value={`[${skill.statBoost.values.join(', ')}]`} />
              </div>
            )}
            {skill.type === 'NAMED' && skill.namedEffect && (
              <>
                <div className="ev-field-grid">
                  <Field label="Effect" value={skill.namedEffect.name} />
                  <Field label="Target" value={skill.namedEffect.target} />
                  <Field label="Duration" value={`${skill.namedEffect.durationSeconds}s`} />
                  <Field label="Max Stacks" value={String(skill.namedEffect.maxStacks)} />
                  {skill.namedEffect.cooldownSeconds != null && <Field label="Cooldown" value={`${skill.namedEffect.cooldownSeconds}s`} />}
                </div>
                {skill.namedEffect.triggers.length > 0 && (
                  <div className="ev-triggers">
                    <span className="ev-inline-label">Triggers:</span>
                    {skill.namedEffect.triggers.map((t, j) => <code key={j} className="ev-code-tag">{interactionToText(t)}</code>)}
                  </div>
                )}
                {skill.namedEffect.buffs.length > 0 && (
                  <div className="ev-buffs">
                    <span className="ev-inline-label">Buffs:</span>
                    {skill.namedEffect.buffs.map((b, j) => (
                      <span key={j} className="ev-stat-tag">{b.stat.replace(/_/g, ' ')} {b.valueMin}\u2013{b.valueMax}{b.perStack ? ' /stack' : ''}</span>
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
      <div className="ev-field-grid">
        <Field label="ID" value={data.id} />
        <Field label="Rarity" value={starStr(data.rarity)} />
      </div>
      <GSection title={`Pieces (${data.pieces.length})`}>
        {data.pieces.map((piece, i) => (
          <div key={i} className="ev-item-card">
            <span className="ev-item-name">{piece.name}</span>
            <span className="ev-item-meta">{piece.gearCategory} · DEF {piece.defense}</span>
          </div>
        ))}
      </GSection>
      {data.setEffect && (
        <GSection title="Set Effect">
          {data.setEffect.passiveStats && Object.keys(data.setEffect.passiveStats).length > 0 && (
            <div className="ev-field-grid">
              {Object.entries(data.setEffect.passiveStats).map(([k, v]) => <Field key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
            </div>
          )}
          {data.setEffect.effects && data.setEffect.effects.map((eff, i) => (
            <div key={i} className="ev-item-card">
              <div className="ev-item-name">{eff.label}</div>
              <div className="ev-field-grid">
                <Field label="Target" value={eff.target} />
                <Field label="Duration" value={`${eff.durationSeconds}s`} />
                <Field label="Max Stacks" value={String(eff.maxStacks)} />
              </div>
              {eff.triggers.length > 0 && (
                <div className="ev-triggers">
                  <span className="ev-inline-label">Triggers:</span>
                  {eff.triggers.map((t, j) => <code key={j} className="ev-code-tag">{interactionToText(t)}</code>)}
                </div>
              )}
              {eff.buffs.length > 0 && (
                <div className="ev-buffs">
                  <span className="ev-inline-label">Buffs:</span>
                  {eff.buffs.map((b, j) => (
                    <span key={j} className="ev-stat-tag">{b.stat.replace(/_/g, ' ')} {b.value}{b.perStack ? ' /stack' : ''}</span>
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
      <div className="ev-field-grid">
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
          <div className="ev-item-desc">{data.description}</div>
        </GSection>
      )}
      {data.segments && data.segments.length > 0 && (
        <GSection title={`Segments (${data.segments.length})`}>
          {data.segments.map((seg, i) => (
            <div key={i} className="ev-item-card">
              <div className="ev-item-name">{seg.name || `Segment ${i + 1}`}</div>
              <Field label="Duration" value={`${seg.durationSeconds}s`} />
              {seg.stats && seg.stats.length > 0 && (
                <div className="ev-field-grid">
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
            <div key={i} className="ev-item-card">
              <div className="ev-item-name">{m.label}</div>
              <div className="ev-buffs">
                <span className="ev-inline-label">Values (Lv1–{m.values.length}):</span>
                <span className="ev-stat-tag">{m.values.join(', ')}</span>
              </div>
            </div>
          ))}
        </GSection>
      )}
      {data.associationIds && data.associationIds.length > 0 && (
        <GSection title="Linked Operators">
          <div className="ev-triggers">
            {data.associationIds.map((id, i) => <code key={i} className="ev-code-tag">{id}</code>)}
          </div>
        </GSection>
      )}
    </>
  );
}

/** Reusable card for a CustomStatusEventDef. */
function StatusEventCard({ se }: { se: CustomStatusEventDef }) {
  return (
    <div className="ev-item-card">
      <div className="ev-item-name">{se.name || '(unnamed)'}</div>
      <div className="ev-field-grid">
        <Field label="Target" value={se.target} />
        <Field label="Element" value={se.element} />
        <Field label="Duration" value={`${se.durationValues?.[0] ?? '?'} ${se.durationUnit ?? ''}`} />
        <Field label="Stack" value={`${se.stack?.interactionType} max ${Array.isArray(se.stack?.max) ? se.stack.max[0] : se.stack?.max}`} />
        <Field label="Instances" value={String(se.stack?.instances ?? 1)} />
        {se.isNamedEvent && <Field label="Named" value="Yes" />}
      </div>
      {se.stats && se.stats.length > 0 && (
        <div className="ev-buffs">
          <span className="ev-inline-label">Stats:</span>
          {se.stats.map((s, i) => (
            <span key={i} className="ev-stat-tag">{String(s.statType).replace(/_/g, ' ')} [{(s.value ?? []).join(', ')}]</span>
          ))}
        </div>
      )}
      {se.clause && se.clause.length > 0 && (
        <div className="ev-triggers">
          <span className="ev-inline-label">Clause:</span>
          {se.clause.map((pred, pi) => (
            <div key={pi}>
              {(pred.conditions ?? []).map((c: Interaction, ci: number) => <code key={ci} className="ev-code-tag">{interactionToText(c)}</code>)}
              {pred.effects && pred.effects.length > 0 && (
                <>{' → '}{pred.effects.map((e: Effect, ei: number) => <code key={ei} className="ev-code-tag">{effectToText(e)}</code>)}</>
              )}
            </div>
          ))}
        </div>
      )}
      {se.onTriggerClause && se.onTriggerClause.length > 0 && (
        <div className="ev-triggers">
          <span className="ev-inline-label">Trigger:</span>
          {se.onTriggerClause.map((pred, pi) => (
            <div key={pi}>
              {(pred.conditions ?? []).map((c: Interaction, ci: number) => <code key={ci} className="ev-code-tag">{interactionToText(c)}</code>)}
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
        <div className="ev-field-grid">
          {scalarEntries.map(([k, v]) => <Field key={k} label={k} value={String(v)} />)}
        </div>
      )}
      {passiveStats.length > 0 && (
        <GSection title="Passive Stats">
          <div className="ev-field-grid">
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

// ── Builtin item views (read directly from source JSON) ──────────────────────

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

function BuiltinOperatorSkillSection({ operatorId, skillType, skill, onExpandedChange }: {
  operatorId: string;
  skillType: SkillType;
  skill: SkillDef;
  onExpandedChange?: (entryId: string | null) => void;
}) {
  const JSON_KEYS: Record<SkillType, string> = { basic: 'BASIC_ATTACK', battle: 'BATTLE_SKILL', combo: 'COMBO_SKILL', ultimate: 'ULTIMATE' };
  const skillEntries = useMemo(
    () => buildSkillEntries(operatorId, JSON_KEYS[skillType]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [operatorId, skillType],
  );

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleEntry = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      const isOpen = next.has(id);
      if (isOpen) next.delete(id); else next.add(id);
      onExpandedChange?.(isOpen ? (next.size > 0 ? Array.from(next).pop()! : null) : id);
      return next;
    });
  }, [onExpandedChange]);

  // Reset expanded state when skill type changes
  useEffect(() => { setExpandedIds(new Set()); onExpandedChange?.(null); }, [skillType, onExpandedChange]);

  const comboTrigger = useMemo(
    () => skillType === 'combo' ? resolveComboTrigger(operatorId) : null,
    [operatorId, skillType],
  );

  const ultEnergy = useMemo(
    () => skillType === 'ultimate' ? resolveUltimateEnergy(operatorId, 0, skill.gaugeGain, skill.teamGaugeGain) : null,
    [operatorId, skillType, skill.gaugeGain, skill.teamGaugeGain],
  );


  return (
    <>
      {/* Skill entries as collapsible pills */}
      {skillEntries.map((entry, i) => {
        const isOpen = expandedIds.has(entry.id);
        return (
          <div key={entry.id} className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`} style={(() => {
            const el = ((entry.data.properties as Record<string, unknown> | undefined)?.element as string) ?? skill.element;
            const color = el ? ELEMENT_COLORS[el as ElementType] : undefined;
            return color ? { '--accent': color, '--accent-glow': `color-mix(in srgb, ${color} 30%, transparent)` } as React.CSSProperties : undefined;
          })()}>
            <div className="ops-skill-card-header" onClick={() => toggleEntry(entry.id)}>
              {(() => {
                const iconKey = (entry.data.metadata as Record<string, unknown> | undefined)?.icon as string | undefined;
                const iconSrc = iconKey ? SKILL_ICONS[iconKey] : undefined;
                return iconSrc ? <img className="ops-skill-card-icon" src={iconSrc} alt="" /> : null;
              })()}
              <div className="ops-skill-card-header-content">
                <div className="ops-skill-card-title-row">
                  <span className="ops-skill-card-index">{i + 1}</span>
                  <span className="ops-skill-card-name">{entry.label}</span>
                  <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
                </div>
                {entry.data.properties?.description && (
                  <span className="ops-skill-card-desc">{entry.data.properties.description}</span>
                )}
              </div>
            </div>
            {isOpen && (
              <div className="ops-skill-form">
                {/* Properties */}
                <ReadonlyField label="Name" value={entry.data.properties?.name as string} />
                <ReadonlyField label="Element" value={((entry.data.properties as Record<string, unknown> | undefined)?.element as string) ?? skill.element} />
                {(() => {
                  const jsonSegs = (entry.data.segments ?? []) as { properties?: Record<string, unknown> }[];
                  let activeSec = 0;
                  let cdSec = 0;
                  for (const seg of jsonSegs) {
                    const dur = seg.properties?.duration as { value: unknown; unit: string } | undefined;
                    const val = dur ? resolveLeaf(dur.value) : null;
                    const sec = val != null ? (dur!.unit === 'FRAME' ? val / 120 : val) : 0;
                    const types = (seg.properties?.segmentTypes ?? []) as string[];
                    if (types.includes('COOLDOWN') || types.includes('IMMEDIATE_COOLDOWN')) {
                      cdSec += sec;
                    } else {
                      activeSec += sec;
                    }
                  }
                  return (
                    <>
                      {activeSec > 0 && <ReadonlyField label="Duration" value={`${fmtN(activeSec)}s`} />}
                      {cdSec > 0 && <ReadonlyField label="Cooldown" value={`${fmtN(cdSec)}s`} />}
                    </>
                  );
                })()}

                {/* Combo trigger (only for combo skills) */}
                {comboTrigger && i === 0 && (
                  <div className="ops-combo-trigger-block">
                    <div className="ops-sub-header">
                      <span className="ops-sub-label">Combo Trigger</span>
                    </div>
                    <div className="ops-empty" style={{ fontStyle: 'normal', color: 'var(--text-secondary)' }}>{comboTrigger.description}</div>
                  </div>
                )}

                {/* Resources */}
                {skill.skillPointCost != null && <ReadonlyField label="SP Cost" value={String(skill.skillPointCost)} />}
                {ultEnergy && (
                  <>
                    <ReadonlyField label="Energy Cost" value={String(ultEnergy.adjustedCost)} />
                    {ultEnergy.gaugeGain != null && ultEnergy.gaugeGain > 0 && <ReadonlyField label="Gauge Gain" value={String(ultEnergy.gaugeGain)} />}
                    {ultEnergy.teamGaugeGain != null && ultEnergy.teamGaugeGain > 0 && <ReadonlyField label="Team Gauge" value={String(ultEnergy.teamGaugeGain)} />}
                  </>
                )}

                {/* Segments as tabs */}
                <TabbedSegmentView entry={entry} />
              </div>
            )}
          </div>
        );
      })}

      {skillEntries.length === 0 && (
        <div className="ops-empty">No {VIEWER_SKILL_TAB_LABELS[skillType]?.toLowerCase()} skill data available</div>
      )}
    </>
  );
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function toRoman(n: number) { return ROMAN[n - 1] ?? String(n); }

const JSON_SKILL_KEYS: Record<SkillType, string> = { basic: 'BASIC_ATTACK', battle: 'BATTLE_SKILL', combo: 'COMBO_SKILL', ultimate: 'ULTIMATE' };

const FPS = 120;

function buildMockEvent(entry: { id: string; label: string; data: JsonSkillData }, operatorId: string, skillType: string): TimelineEvent | null {
  const jsonSegs = (entry.data.segments ?? []) as { properties?: Record<string, unknown>; frames?: Record<string, unknown>[] }[];
  if (jsonSegs.length === 0) return null;

  const eventSegs: EventSegmentData[] = jsonSegs.map((seg, si) => {
    const dur = seg.properties?.duration as { value: unknown; unit: string } | undefined;
    const durVal = dur ? resolveLeaf(dur.value) : null;
    const durFrames = durVal != null ? (dur!.unit === 'FRAME' ? durVal : Math.round(durVal * FPS)) : 24;

    const frames: EventFrameMarker[] = (seg.frames ?? []).map((f) => {
      const off = (f.properties as Record<string, unknown> | undefined)?.offset as { value: unknown; unit: string } | undefined;
      const offVal = off ? resolveLeaf(off.value) : null;
      const offFrames = offVal != null ? (off!.unit === 'FRAME' ? offVal : Math.round(offVal * FPS)) : 0;
      return { offsetFrame: offFrames };
    });

    return {
      properties: { duration: durFrames, name: String(si + 1) },
      frames,
    };
  });

  return {
    uid: `skill-preview-${operatorId}-${skillType}-${entry.id}`,
    id: entry.id,
    name: entry.label,
    ownerId: operatorId,
    columnId: 'preview',
    startFrame: 0,
    segments: eventSegs,
  } as TimelineEvent;
}

function SkillTimeline({ operatorId, skillType, color, selectedEntryId }: { operatorId: string; skillType: SkillType; color: string; selectedEntryId?: string | null }) {
  const entries = useMemo(() => buildSkillEntries(operatorId, JSON_SKILL_KEYS[skillType]), [operatorId, skillType]);
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setZoom(1); }, [operatorId, skillType]);

  const mockEvents = useMemo(() => {
    const filtered = selectedEntryId ? entries.filter(e => e.id === selectedEntryId) : [];
    return filtered.map(e => ({ entry: e, event: buildMockEvent(e, operatorId, skillType) })).filter(x => x.event != null) as { entry: typeof entries[0]; event: TimelineEvent }[];
  }, [entries, operatorId, skillType, selectedEntryId]);

  // Shift+wheel to zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        setZoom(prev => Math.max(0.5, Math.min(5, prev * (e.deltaY < 0 ? 1.15 : 0.87))));
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const noop = () => {};
  const [containerH, setContainerH] = useState(400);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e.contentRect.height > 0) setContainerH(e.contentRect.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (mockEvents.length === 0) {
    return <div className="ops-skill-timeline" ref={scrollRef} />;
  }

  const bufferFrames = Math.round(0.2 * FPS); // 0.2s buffer
  const maxFrames = Math.max(...mockEvents.map(({ event }) => computeSegmentsSpan(event.segments)));
  const targetH = containerH * 0.5;
  const baseZoom = maxFrames > 0 ? targetH / maxFrames : 1;
  const effectiveZoom = baseZoom * zoom;
  const eventHeightPx = maxFrames * effectiveZoom;
  const bufferPx = bufferFrames * effectiveZoom;
  const totalHeightPx = eventHeightPx + bufferPx * 2;

  // Time ticks (relative to event start, not buffer)
  const totalSec = maxFrames / FPS;
  const tickInterval = totalSec <= 1 ? 0.25 : totalSec <= 3 ? 0.5 : totalSec <= 8 ? 1 : 2;
  const ticks: number[] = [];
  for (let t = 0; t <= totalSec; t += tickInterval) ticks.push(t);

  // Vertical offset to center
  const topPad = (containerH - totalHeightPx) / 2;

  return (
    <div className="ops-skill-timeline" ref={scrollRef}>
      <div className="ops-skill-timeline-content" style={{ paddingTop: Math.max(topPad, 0) }}>
        <div className="ops-skill-timeline-row">
          {/* Time axis — offset by buffer so ticks align with event */}
          <div className="ops-skill-timeline-axis" style={{ height: totalHeightPx }}>
            {ticks.map((t) => (
              <div
                key={t}
                className="ops-skill-timeline-tick"
                style={{ top: bufferPx + (totalSec > 0 ? (t / totalSec) * eventHeightPx : 0) }}
              >
                {fmtN(t)}s
              </div>
            ))}
          </div>

          {/* Event columns */}
          {mockEvents.map(({ entry, event }) => {
            const skillElement = ((entry.data.properties as Record<string, unknown> | undefined)?.element as string) ?? undefined;
            const bufferedEvent = { ...event, startFrame: bufferFrames };
            return (
              <div key={entry.id} className="ops-skill-timeline-body" style={{ height: totalHeightPx }}>
                <EventBlock
                  event={bufferedEvent}
                  color={color}
                  zoom={effectiveZoom}
                  onDragStart={noop}
                  onContextMenu={noop}
                  notDraggable
                  skillElement={skillElement}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function resolveLeaf(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'value' in v) return resolveLeaf((v as Record<string, unknown>).value);
  return null;
}

function formatDuration(dur: { value: unknown; unit: string } | undefined): string {
  if (!dur) return '';
  const val = resolveLeaf(dur.value);
  if (val == null) return '';
  const unit = dur.unit === 'FRAME' ? 'f' : 's';
  return `${val}${unit}`;
}

function TabbedSegmentView({ entry }: { entry: { id: string; label: string; data: JsonSkillData } }) {
  const segments = entry.data.segments ?? [];
  const topFrames = entry.data.frames ?? [];
  const [activeSegTab, setActiveSegTab] = useState(0);
  const [activeFrameTab, setActiveFrameTab] = useState<number | null>(null);

  // Clicking a segment shows segment info (no frame selected)
  const handleSegChange = useCallback((si: number) => {
    setActiveSegTab(si);
    setActiveFrameTab(null);
  }, []);

  if (segments.length === 0 && topFrames.length === 0) return null;

  if (segments.length === 0) {
    // Flat frames only
    const flatFrame = activeFrameTab != null ? activeFrameTab : 0;
    return (
      <div className="ops-seg-view">
        <div className="ops-conjoined-tabs">
          <div className="ops-conjoined-row">
            {topFrames.map((_f, fi) => (
              <button
                key={fi}
                type="button"
                className={`ops-conjoined-btn${flatFrame === fi ? ' ops-conjoined-btn--active' : ''}`}
                onClick={() => setActiveFrameTab(fi)}
              >
                {toRoman(fi + 1)}
              </button>
            ))}
          </div>
        </div>
        {topFrames[flatFrame] && (
          <FrameDetail frame={topFrames[flatFrame]} label={`Frame ${toRoman(flatFrame + 1)}`} />
        )}
      </div>
    );
  }

  const safeSeg = Math.min(activeSegTab, segments.length - 1);
  const seg = segments[safeSeg];
  const durStr = formatDuration(seg.properties?.duration ?? seg.duration as { value: unknown; unit: string } | undefined);
  const segFrames = (seg.frames ?? []) as JsonSkillData[];
  const segClause = (seg.clause ?? []) as typeof entry.data.clause;
  const viewingFrame = activeFrameTab != null && activeFrameTab < segFrames.length;

  return (
    <div className="ops-seg-view">
      {/* Conjoined two-row tab header */}
      <div className="ops-conjoined-tabs">
        {/* Row 1: Segments (equal width) */}
        <div className="ops-conjoined-row ops-conjoined-row--seg">
          {segments.map((s, si) => {
            const isActiveSeg = safeSeg === si && !viewingFrame;
            return (
              <button
                key={si}
                type="button"
                className={`ops-conjoined-seg${safeSeg === si ? ' ops-conjoined-seg--current' : ''}${isActiveSeg ? ' ops-conjoined-seg--active' : ''}`}
                onClick={() => handleSegChange(si)}
              >
                {s.properties?.name || `Segment ${si + 1}`}
              </button>
            );
          })}
        </div>
        {/* Row 2: Frame sub-buttons under their segment */}
        <div className="ops-conjoined-row ops-conjoined-row--frame">
          {segments.map((s, si) => {
            const frames = (s.frames ?? []) as JsonSkillData[];
            return (
              <div key={si} className="ops-conjoined-frame-group">
                {frames.length > 0 ? frames.map((_f, fi) => (
                  <button
                    key={fi}
                    type="button"
                    className={`ops-conjoined-btn${safeSeg === si && activeFrameTab === fi ? ' ops-conjoined-btn--active' : ''}`}
                    onClick={() => { setActiveSegTab(si); setActiveFrameTab(fi); }}
                  >
                    {toRoman(fi + 1)}
                  </button>
                )) : (
                  <span className="ops-conjoined-btn ops-conjoined-btn--empty" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail: segment info OR frame info */}
      <div className="ops-seg-detail">
        {viewingFrame ? (
          <FrameDetail frame={segFrames[activeFrameTab!]} label={`Frame ${toRoman(activeFrameTab! + 1)}`} />
        ) : (
          <div className="ops-frame-detail ops-frame-detail--accented">
            <div className="ops-frame-accent-label">{seg.properties?.name || `Segment ${safeSeg + 1}`}</div>
            {durStr && (
              <div className="ops-frame-prop">
                <span className="ops-frame-prop-label">Duration</span>
                <span className="ops-frame-prop-value">{durStr}</span>
              </div>
            )}
            {segClause && segClause.length > 0 && (
              <div className="ops-seg-clause">
                <ClauseEditor initialValue={segClause} onChange={() => {}} readOnly />
              </div>
            )}
            {segFrames.map((f, fi) => {
              const fOffset = f.properties?.offset ?? f.offset as { value: unknown; unit: string } | undefined;
              const fOffsetStr = formatDuration(fOffset);
              const fClause = (f.clause ?? []) as unknown as { conditions?: unknown[]; effects?: Record<string, unknown>[] }[];
              const fEffects: Record<string, unknown>[] = [];
              for (const c of fClause) { if (c.effects) fEffects.push(...c.effects); }
              return (
                <div key={fi} className="ops-seg-inline-frame">
                  <div className="ops-seg-inline-frame-name">Frame {toRoman(fi + 1)}</div>
                  {fOffsetStr && (
                    <div className="ops-frame-prop">
                      <span className="ops-frame-prop-label">Offset</span>
                      <span className="ops-frame-prop-value">{fOffsetStr}</span>
                    </div>
                  )}
                  {fEffects.map((ef, ei) => {
                    const verb = String(ef.verb ?? '').replace(/_/g, ' ');
                    const adj = ef.adjective ? (Array.isArray(ef.adjective) ? (ef.adjective as string[]).join(' ') : String(ef.adjective)).replace(/_/g, ' ') : '';
                    const obj = String(ef.object ?? '').replace(/_/g, ' ');
                    const to = ef.to ? String(ef.to).replace(/_/g, ' ') : '';
                    return (
                      <div key={ei} className="ops-frame-effect-sentence">
                        <span className="ops-frame-effect-verb">{verb}</span>
                        {adj && <span className="ops-frame-effect-adj">{adj}</span>}
                        <span className="ops-frame-effect-obj">{obj}</span>
                        {to && <><span className="ops-frame-effect-prep">to</span><span className="ops-frame-effect-target">{to}</span></>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatWithValue(w: Record<string, unknown>): string {
  if ('verb' in w && w.verb === 'VARY_BY') {
    const vals = w.value as number[];
    if (Array.isArray(vals) && vals.length > 0) {
      const first = typeof vals[0] === 'number' ? vals[0] : 0;
      const last = typeof vals[vals.length - 1] === 'number' ? vals[vals.length - 1] : 0;
      return `${first}\u2013${last} (by ${String(w.object ?? 'level').replace(/_/g, ' ').toLowerCase()})`;
    }
    return String(w.value);
  }
  if ('verb' in w && w.verb === 'IS') return String(w.value);
  if ('value' in w) {
    const inner = w.value;
    if (inner && typeof inner === 'object') return formatWithValue(inner as Record<string, unknown>);
    return String(inner);
  }
  return JSON.stringify(w);
}

function FrameDetail({ frame, label }: { frame: JsonSkillData; label?: string }) {
  const offset = frame.properties?.offset ?? frame.offset as { value: unknown; unit: string } | undefined;
  const offsetStr = formatDuration(offset);
  const clause = (frame.clause ?? []) as unknown as { conditions?: unknown[]; effects?: Record<string, unknown>[] }[];

  // Collect extra properties (excluding offset/name/description)
  const props: { label: string; value: string }[] = [];
  const frameProps = frame.properties as Record<string, unknown> | undefined;
  if (frameProps) {
    for (const [k, v] of Object.entries(frameProps)) {
      if (k === 'offset' || k === 'name' || k === 'description') continue;
      if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
        props.push({ label: k.replace(/_/g, ' '), value: formatWithValue(v as Record<string, unknown>) });
      } else if (v != null) {
        props.push({ label: k.replace(/_/g, ' '), value: String(v) });
      }
    }
  }

  // Collect conditions and effects from all clauses
  const conditions: unknown[] = [];
  const effects: Record<string, unknown>[] = [];
  for (const c of clause) {
    if (c.conditions && c.conditions.length > 0) conditions.push(...c.conditions);
    if (c.effects) effects.push(...c.effects);
  }

  return (
    <div className="ops-frame-detail ops-frame-detail--accented">
      {/* Frame label */}
      {label && <div className="ops-frame-accent-label">{label}</div>}

      {/* Offset */}
      {offsetStr && (
        <div className="ops-frame-prop">
          <span className="ops-frame-prop-label">Offset</span>
          <span className="ops-frame-prop-value">{offsetStr}</span>
        </div>
      )}

      {/* Extra properties */}
      {props.length > 0 && (
        <div className="ops-frame-props">
          {props.map((p, i) => (
            <div key={i} className="ops-frame-prop">
              <span className="ops-frame-prop-label">{p.label}</span>
              <span className="ops-frame-prop-value">{p.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Conditions (only if present) */}
      {conditions.length > 0 && (
        <div className="ops-frame-conditions">
          <span className="ops-frame-section-label">Conditions</span>
          {conditions.map((cond, ci) => {
            const c = cond as Record<string, unknown>;
            return <div key={ci} className="ops-frame-prop-value">{String(c.verb ?? '').replace(/_/g, ' ')} {String(c.object ?? '').replace(/_/g, ' ')}</div>;
          })}
        </div>
      )}

      {/* Effects */}
      {effects.length > 0 ? (
        <div className="ops-frame-effects">
          {effects.map((ef, i) => {
            const verb = String(ef.verb ?? '').replace(/_/g, ' ');
            const adj = ef.adjective ? (Array.isArray(ef.adjective) ? (ef.adjective as string[]).join(' ') : String(ef.adjective)).replace(/_/g, ' ') : '';
            const obj = String(ef.object ?? '').replace(/_/g, ' ');
            const to = ef.to ? String(ef.to).replace(/_/g, ' ') : '';
            const withProps = (ef.with ?? {}) as Record<string, unknown>;
            const withEntries = Object.entries(withProps);

            return (
              <div key={i} className="ops-frame-effect">
                <div className="ops-frame-effect-sentence">
                  <span className="ops-frame-effect-verb">{verb}</span>
                  {adj && <span className="ops-frame-effect-adj">{adj}</span>}
                  <span className="ops-frame-effect-obj">{obj}</span>
                  {to && <><span className="ops-frame-effect-prep">to</span><span className="ops-frame-effect-target">{to}</span></>}
                </div>
                {withEntries.length > 0 && (
                  <div className="ops-frame-effect-with">
                    {withEntries.map(([key, val]) => {
                      const w = val && typeof val === 'object' ? val as Record<string, unknown> : null;
                      const isVaryBy = w && w.verb === 'VARY_BY' && Array.isArray(w.value);
                      const isTopLevel = key === 'value';
                      const label = isTopLevel ? 'Value' : key.replace(/_/g, ' ');

                      if (isVaryBy) {
                        const vals = w!.value as number[];
                        const byLabel = String(w!.object ?? 'LEVEL').replace(/_/g, ' ').toLowerCase();
                        const rowLabel = label.toLowerCase().replace('damage ', '');
                        return (
                          <div key={key} className="ops-frame-vary">
                            <table className="ops-frame-vary-table">
                              <thead>
                                <tr>
                                  <th className="ops-frame-vary-header">{byLabel}</th>
                                  {vals.map((_v, vi) => <th key={vi}>{vi + 1}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="ops-frame-vary-header">{rowLabel}</td>
                                  {vals.map((v, vi) => <td key={vi}>{v}</td>)}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        );
                      }

                      const display = w ? formatWithValue(w) : String(val);
                      return (
                        <div key={key} className="ops-frame-prop">
                          <span className="ops-frame-prop-label">{label}</span>
                          <span className="ops-frame-prop-value">{display}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ops-frame-empty">No effects</div>
      )}
    </div>
  );
}

function ClausePredicateView({ predicate }: { predicate: Record<string, unknown> }) {
  const conditions = (predicate.conditions ?? []) as Record<string, unknown>[];
  const effects = (predicate.effects ?? []) as Record<string, unknown>[];

  return (
    <div className="ops-clause-predicate">
      {conditions.length > 0 && (
        <div className="ops-clause-conditions">
          <span className="ops-frame-prop-label">When</span>
          {conditions.map((c, ci) => {
            const parts = [c.subject, c.verb, c.adjective, c.object].filter(Boolean).map(v => String(v).replace(/_/g, ' ')).join(' ');
            const constraint = c.cardinalityConstraint ? `${String(c.cardinalityConstraint).replace(/_/g, ' ')} ${c.value ?? ''}` : '';
            return <div key={ci} className="ops-clause-condition-text">{parts}{constraint ? ` ${constraint}` : ''}</div>;
          })}
        </div>
      )}
      {effects.map((ef, ei) => {
        const verb = String(ef.verb ?? '').replace(/_/g, ' ');
        const adj = ef.adjective ? (Array.isArray(ef.adjective) ? (ef.adjective as string[]).join(' ') : String(ef.adjective)).replace(/_/g, ' ') : '';
        const obj = String(ef.object ?? '').replace(/_/g, ' ');
        const objId = ef.objectId ? String(ef.objectId).replace(/_/g, ' ') : '';
        const to = ef.to ? String(ef.to).replace(/_/g, ' ') : '';
        const toDet = ef.toDeterminer ? String(ef.toDeterminer).replace(/_/g, ' ') : '';
        const withProps = (ef.with ?? {}) as Record<string, unknown>;
        const withEntries = Object.entries(withProps);

        return (
          <div key={ei} className="ops-frame-effect">
            <div className="ops-frame-effect-sentence">
              <span className="ops-frame-effect-verb">{verb}</span>
              {adj && <span className="ops-frame-effect-adj">{adj}</span>}
              <span className="ops-frame-effect-obj">{objId || obj}</span>
              {to && <><span className="ops-frame-effect-prep">{toDet ? `to ${toDet.toLowerCase()}` : 'to'}</span><span className="ops-frame-effect-target">{to}</span></>}
            </div>
            {withEntries.length > 0 && (
              <div className="ops-frame-effect-with">
                {withEntries.map(([key, val]) => {
                  const w = val && typeof val === 'object' ? val as Record<string, unknown> : null;
                  const isVaryBy = w && w.verb === 'VARY_BY' && Array.isArray(w.value);
                  const label = key === 'value' ? 'Value' : key.replace(/_/g, ' ');

                  if (isVaryBy) {
                    const vals = w!.value as number[];
                    const byLabel = String(w!.object ?? 'LEVEL').replace(/_/g, ' ').toLowerCase();
                    const rowLabel = label.toLowerCase().replace('damage ', '');
                    return (
                      <div key={key} className="ops-frame-vary">
                        <table className="ops-frame-vary-table">
                          <thead><tr><th className="ops-frame-vary-header">{byLabel}</th>{vals.map((_v, vi) => <th key={vi}>{vi + 1}</th>)}</tr></thead>
                          <tbody><tr><td className="ops-frame-vary-header">{rowLabel}</td>{vals.map((v, vi) => <td key={vi}>{v}</td>)}</tr></tbody>
                        </table>
                      </div>
                    );
                  }

                  const display = w ? formatWithValue(w) : String(val);
                  return (
                    <div key={key} className="ops-frame-prop">
                      <span className="ops-frame-prop-label">{label}</span>
                      <span className="ops-frame-prop-value">{display}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ClauseTabs({ clause, onTrigger, onEntry, onExit }: { clause: unknown[]; onTrigger: unknown[]; onEntry: unknown[]; onExit: unknown[] }) {
  const tabs: { label: string; data: unknown[] }[] = [];
  if (clause.length > 0) tabs.push({ label: 'Clause', data: clause });
  if (onTrigger.length > 0) tabs.push({ label: 'On Trigger', data: onTrigger });
  if (onEntry.length > 0) tabs.push({ label: 'On Entry', data: onEntry });
  if (onExit.length > 0) tabs.push({ label: 'On Exit', data: onExit });
  const [activeTab, setActiveTab] = useState(0);

  if (tabs.length === 0) return null;
  const safeTab = Math.min(activeTab, tabs.length - 1);

  // If only one tab, skip the tab bar
  if (tabs.length === 1) {
    return (
      <div className="ops-clause-tabs">
        <div className="ops-clause-content">
          {(tabs[0].data as Record<string, unknown>[]).map((pred, pi) => (
            <ClausePredicateView key={pi} predicate={pred} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ops-clause-tabs">
      <div className="ops-skill-tabs ops-skill-tabs--sub">
        {tabs.map((t, i) => (
          <button
            key={i}
            type="button"
            className={`ops-skill-tab${safeTab === i ? ' ops-skill-tab--active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            <span className="ops-skill-tab-label">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="ops-clause-content">
        {(tabs[safeTab].data as Record<string, unknown>[]).map((pred, pi) => (
          <ClausePredicateView key={pi} predicate={pred} />
        ))}
      </div>
    </div>
  );
}

function BuiltinOperatorStatusesView({ operatorId }: { operatorId: string }) {
  const statuses = useMemo(() =>
    getOperatorStatuses(operatorId).map(s => s.serialize() as Record<string, unknown>)
      .filter(s => (s.properties as Record<string, unknown> | undefined)?.eventCategoryType !== 'TALENT'),
    [operatorId],
  );
  const [openIdxSet, setOpenIdxSet] = useState<Set<number>>(new Set());

  if (statuses.length === 0) return <div className="ops-empty">No status data available</div>;

  return (
    <>
      {statuses.map((s, i) => {
        const props = s.properties as Record<string, unknown> | undefined;
        const name = (props?.name as string) ?? (props?.id as string) ?? `Status ${i + 1}`;
        const desc = props?.description as string | undefined;
        const isOpen = openIdxSet.has(i);
        const clause = (s.clause ?? []) as unknown[];
        const onTrigger = (s.onTriggerClause ?? []) as unknown[];
        const onEntry = (s.onEntryClause ?? []) as unknown[];
        const onExit = (s.onExitClause ?? []) as unknown[];
        const hasClauses = clause.length > 0 || onTrigger.length > 0 || onEntry.length > 0 || onExit.length > 0;
        return (
          <div key={i} className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`}>
            <div className="ops-skill-card-header" onClick={() => setOpenIdxSet(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}>
              <div className="ops-skill-card-header-content">
                <div className="ops-skill-card-title-row">
                  <span className="ops-skill-card-index">{i + 1}</span>
                  <span className="ops-skill-card-name">{name}</span>
                  <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
                </div>
                {desc && <span className="ops-skill-card-desc">{desc}</span>}
              </div>
            </div>
            {isOpen && (
              <div className="ops-skill-form">
                <ReadonlyField label="Name" value={name} />
                {typeof props?.element === 'string' && <ReadonlyField label="Element" value={props.element} />}
                {desc && <ReadonlyField label="Description" value={desc} />}
                {hasClauses && (
                  <ClauseTabs clause={clause} onTrigger={onTrigger} onEntry={onEntry} onExit={onExit} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="ops-field">
      <span className="ops-field-label">{label}</span>
      <span className="ops-field-value">{String(value)}</span>
    </div>
  );
}

function ReadonlySection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ops-section">
      <div className="ops-section-rule">
        <span className="ops-section-label">{label}</span>
      </div>
      <div className="ops-section-body">{children}</div>
    </div>
  );
}

const VIEWER_SKILL_TYPES = ['basic', 'battle', 'combo', 'ultimate'] as const;
const VIEWER_SKILL_TAB_LABELS: Record<string, string> = {
  basic: 'Basic Attack', battle: 'Battle Skill', combo: 'Combo Skill', ultimate: 'Ultimate',
};
function BuiltinOperatorView({ id }: { id: string }) {
  const op = ALL_OPERATORS.find((o) => o.id === id);
  const opBase = useMemo(() => getOperatorBase(id), [id]);
  const [activeCategory, setActiveCategory] = useState<'skills' | 'potentials' | 'talents' | 'statuses'>('skills');
  const [activeSkillTab, setActiveSkillTab] = useState<string>('basic');
  const [openPotentials, setOpenPotentials] = useState<Set<number>>(new Set());
  const [openTalents, setOpenTalents] = useState<Set<number>>(new Set());
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  if (!op) return null;

  const statsByLevel = (opBase?.statsByLevel ?? []) as { level: number; operatorPromotionStage: number; attributes: Record<string, number> }[];
  const lv1Stats = statsByLevel.find((s) => s.level === 1 && s.operatorPromotionStage === 0)?.attributes ?? {};
  const lv90Stats = statsByLevel.find((s) => s.level === 90)?.attributes
    ?? statsByLevel[statsByLevel.length - 1]?.attributes ?? {};
  const potentials = (opBase?.potentials ?? []) as { level: number; name: string; effects: unknown[] }[];

  return (
    <div className="ops-root ops-root--readonly ops-root--split" style={{ '--op-accent': ELEMENT_COLORS[op.element as ElementType] ?? ELEMENT_COLORS[ElementType.NONE] } as React.CSSProperties}>
      {/* ── LEFT HALF: Identity, Stats, Potentials, Talents ── */}
      <div className="ops-split-left">
        {/* ── Banner Splash Art ── */}
        {op.splash && (
          <div className="ops-splash-banner">
            <img className="ops-splash-img" src={op.splash} alt={op.name} />
          </div>
        )}

        {/* ── IDENTITY ── */}
        <ReadonlySection label="IDENTITY">
          <div className="ops-row">
            <ReadonlyField label="Name" value={op.name} />
            <div className="ops-field">
              <span className="ops-field-label">Rarity</span>
              <div className="ops-rarity-group">
                {([4, 5, 6] as const).map((r) => (
                  <span
                    key={r}
                    className={`ops-rarity-btn${op.rarity === r ? ' ops-rarity-btn--active' : ''}`}
                  >
                    {r}&#9733;
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="ops-row">
            <ReadonlyField label="Class" value={op.role} />
            <ReadonlyField label="Element" value={op.element} />
          </div>
          <div className="ops-weapon-row">
            <span className="ops-field-label">Weapons</span>
            <div className="ops-pill-group">
              {(op.weaponTypes ?? []).map((w) => (
                <span key={w} className="ops-pill ops-pill--active">{w.replace(/_/g, ' ')}</span>
              ))}
            </div>
          </div>
        </ReadonlySection>

        {/* ── BASE STATS ── */}
        <ReadonlySection label="BASE STATS">
          <div className="ops-stats-pair">
            <div className="ops-stat-block">
              <div className="ops-stat-header"><span>Lv 1</span></div>
              <div className="ops-stat-grid">
                {Object.entries(lv1Stats).map(([key, val]) => (
                  <div key={key} className="ops-stat-row">
                    <span className="ops-stat-name ops-stat-name--fixed">{key.replace(/_/g, ' ')}</span>
                    <span className="ops-stat-value">{formatStatVal(key, val)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="ops-stat-block">
              <div className="ops-stat-header"><span>Lv 90</span></div>
              <div className="ops-stat-grid">
                {Object.entries(lv90Stats).map(([key, val]) => (
                  <div key={key} className="ops-stat-row">
                    <span className="ops-stat-name ops-stat-name--fixed">{key.replace(/_/g, ' ')}</span>
                    <span className="ops-stat-value">{formatStatVal(key, val)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ReadonlySection>
      </div>

      {/* ── MIDDLE: Skills / Potentials / Talents / Statuses ── */}
      <div className="ops-split-right">
        {/* Category tabs */}
        <div className="ops-skill-tabs">
          {(['skills', 'potentials', 'talents', 'statuses'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              className={`ops-skill-tab${activeCategory === cat ? ' ops-skill-tab--active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              <span className="ops-skill-tab-label">{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
            </button>
          ))}
        </div>

        {/* Skills content */}
        {activeCategory === 'skills' && (
          <>
            <div className="ops-skill-tabs ops-skill-tabs--sub">
              {VIEWER_SKILL_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`ops-skill-tab${activeSkillTab === type ? ' ops-skill-tab--active' : ''}`}
                  onClick={() => setActiveSkillTab(type)}
                >
                  <span className="ops-skill-tab-label">{VIEWER_SKILL_TAB_LABELS[type]}</span>
                </button>
              ))}
            </div>
            <BuiltinOperatorSkillSection
              operatorId={id}
              skillType={activeSkillTab as SkillType}
              skill={op.skills[activeSkillTab as SkillType]}
              onExpandedChange={setExpandedEntryId}
            />
          </>
        )}

        {/* Potentials content */}
        {activeCategory === 'potentials' && (
          potentials.length > 0 ? potentials.map((pot, i) => {
            const isOpen = openPotentials.has(i);
            const potTyped = pot as { level: number; name: string; description?: string; effects?: unknown[] };
            return (
              <div key={pot.level} className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`}>
                <div className="ops-skill-card-header" onClick={() => setOpenPotentials(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}>
                  <div className="ops-skill-card-header-content">
                    <div className="ops-skill-card-title-row">
                      <span className="ops-skill-card-index">P{pot.level}</span>
                      <span className="ops-skill-card-name">{pot.name}</span>
                      <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
                    </div>
                    {potTyped.description && (
                      <span className="ops-skill-card-desc">{potTyped.description}</span>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div className="ops-skill-form">
                    <ReadonlyField label="Name" value={pot.name} />
                    <ReadonlyField label="Level" value={`P${pot.level}`} />
                    {potTyped.description && <ReadonlyField label="Description" value={potTyped.description} />}
                  </div>
                )}
              </div>
            );
          }) : <div className="ops-empty">No potential data available</div>
        )}

        {/* Talents content — from operator statuses with TALENT category */}
        {activeCategory === 'talents' && (() => {
          const talentStatuses = getOperatorStatuses(id)
            .map(s => s.serialize() as Record<string, unknown>)
            .filter(s => (s.properties as Record<string, unknown> | undefined)?.eventCategoryType === 'TALENT');
          return talentStatuses.length > 0 ? talentStatuses.map((s, i) => {
            const props = s.properties as Record<string, unknown>;
            const name = (props.name as string) ?? (props.id as string) ?? `Talent ${i + 1}`;
            const desc = props.description as string | undefined;
            const isOpen = openTalents.has(i);
            const clause = (s.clause ?? []) as unknown[];
            const onTrigger = (s.onTriggerClause ?? []) as unknown[];
            const onEntry = (s.onEntryClause ?? []) as unknown[];
            const onExit = (s.onExitClause ?? []) as unknown[];
            const hasClauses = clause.length > 0 || onTrigger.length > 0 || onEntry.length > 0 || onExit.length > 0;
            return (
              <div key={i} className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`}>
                <div className="ops-skill-card-header" onClick={() => setOpenTalents(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}>
                  <div className="ops-skill-card-header-content">
                    <div className="ops-skill-card-title-row">
                      <span className="ops-skill-card-index">T{i + 1}</span>
                      <span className="ops-skill-card-name">{name}</span>
                      <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
                    </div>
                    {desc && <span className="ops-skill-card-desc">{desc}</span>}
                  </div>
                </div>
                {isOpen && (
                  <div className="ops-skill-form">
                    <ReadonlyField label="Name" value={name} />
                    {typeof props.element === 'string' && <ReadonlyField label="Element" value={props.element} />}
                    {desc && <ReadonlyField label="Description" value={desc} />}
                    {hasClauses && (
                      <ClauseTabs clause={clause} onTrigger={onTrigger} onEntry={onEntry} onExit={onExit} />
                    )}
                  </div>
                )}
              </div>
            );
          }) : <div className="ops-empty">No talent data available</div>;
        })()}

        {/* Statuses content */}
        {activeCategory === 'statuses' && (
          <BuiltinOperatorStatusesView operatorId={id} />
        )}
      </div>

      {/* ── RIGHT: Timeline ── */}
      <SkillTimeline
        operatorId={id}
        skillType={activeSkillTab as SkillType}
        color={ELEMENT_COLORS[op.element as ElementType] ?? ELEMENT_COLORS[ElementType.NONE]}
        selectedEntryId={expandedEntryId}
      />
    </div>
  );
}

function BuiltinWeaponView({ id }: { id: string }) {
  const weaponId = getWeaponIdByName(id);
  const weapon = weaponId ? getWeapon(weaponId) : undefined;
  const dslDefs = getWeaponEffectDefs(id);
  const [openSkills, setOpenSkills] = useState<Set<number>>(new Set());
  const [openEffects, setOpenEffects] = useState<Set<number>>(new Set());
  const [weaponLevel, setWeaponLevel] = useState(90);
  if (!weapon) return null;

  const namedSkill = getNamedWeaponSkill(weaponId!);

  return (
    <div className="ops-root ops-root--readonly ops-root--split">
      {/* ── LEFT: Identity + Stats ── */}
      <div className="ops-split-left">
        {weapon.icon && (
          <div className="ops-splash-banner">
            <img className="ops-splash-img ops-skill-card-icon--no-invert" src={weapon.icon} alt={weapon.name} style={{ objectFit: 'contain', background: 'var(--bg-elevated)' }} />
          </div>
        )}
        <ReadonlySection label="IDENTITY">
          <ReadonlyField label="Rarity" value={starStr(weapon.rarity)} />
          <ReadonlyField label="Type" value={weapon.type.replace(/_/g, ' ')} />
        </ReadonlySection>

        <ReadonlySection label="BASE STATS">
          <div className="ops-weapon-level-row">
            <span className="ops-field-label">Level</span>
            <input
              type="range"
              min={1}
              max={90}
              value={weaponLevel}
              onChange={(e) => setWeaponLevel(Number(e.target.value))}
              className="ops-weapon-level-slider"
            />
            <span className="ops-weapon-level-value">{weaponLevel}</span>
          </div>
          <ReadonlyField label="Base ATK (Lv1)" value={String(weapon.getBaseAttack(1))} />
          <ReadonlyField label="Base ATK" value={String(weapon.getBaseAttack(weaponLevel))} />
          <ReadonlyField label="Base ATK (Lv90)" value={String(weapon.getBaseAttack(90))} />
        </ReadonlySection>
      </div>

      {/* ── RIGHT: Skills + Effects ── */}
      <div className="ops-split-right">
        <ReadonlySection label="SKILLS">
          {weapon.skills.map((skillId: string, i: number) => {
            const genericSkill = getGenericWeaponSkill(skillId);
            const skillData = genericSkill ?? namedSkill;
            const skillName = skillData?.name ?? skillId.replace(/_/g, ' ');
            const isOpen = openSkills.has(i);
            const clause = (skillData?.clause ?? []) as unknown[];
            const onTrigger = (skillData?.onTriggerClause ?? []) as unknown[];
            const hasClauses = clause.length > 0 || onTrigger.length > 0;
            return (
              <div key={i} className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`}>
                <div className="ops-skill-card-header" onClick={() => setOpenSkills(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}>
                  <div className="ops-skill-card-header-content">
                    <div className="ops-skill-card-title-row">
                      <span className="ops-skill-card-index">{i + 1}</span>
                      <span className="ops-skill-card-name">{skillName}</span>
                      <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
                    </div>
                    {skillData?.description && <span className="ops-skill-card-desc">{skillData.description}</span>}
                  </div>
                </div>
                {isOpen && (
                  <div className="ops-skill-form">
                    <ReadonlyField label="Name" value={skillName} />
                    {skillData?.description && <ReadonlyField label="Description" value={skillData.description} />}
                    {hasClauses && <ClauseTabs clause={clause} onTrigger={onTrigger} onEntry={[]} onExit={[]} />}
                  </div>
                )}
              </div>
            );
          })}
        </ReadonlySection>

      {dslDefs.length > 0 && (
        <ReadonlySection label="TRIGGERED EFFECTS">
          {dslDefs.map((def, i: number) => {
            const isOpen = openEffects.has(i);
            const triggers = resolveTriggerInteractions(def);
            return (
              <div key={i} className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`}>
                <div className="ops-skill-card-header" onClick={() => setOpenEffects(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}>
                  <div className="ops-skill-card-header-content">
                    <div className="ops-skill-card-title-row">
                      <span className="ops-skill-card-index">{i + 1}</span>
                      <span className="ops-skill-card-name">{def.label ?? def.name}</span>
                      <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
                    </div>
                    {def.note && <span className="ops-skill-card-desc">{def.note}</span>}
                  </div>
                </div>
                {isOpen && (
                  <div className="ops-skill-form">
                    <ReadonlyField label="Target" value={resolveTargetDisplay(def)} />
                    <ReadonlyField label="Duration" value={`${resolveDurationSeconds(def)}s`} />
                    <ReadonlyField label="Max Stacks" value={String(def.stack?.max?.P0 ?? 1)} />
                    {(def.cooldownSeconds ?? 0) > 0 && <ReadonlyField label="Cooldown" value={`${def.cooldownSeconds}s`} />}
                    {triggers.length > 0 && (
                      <>
                        {triggers.length > 1 && <span className="ops-frame-prop-label" style={{ marginTop: '0.375rem' }}>Trigger Options</span>}
                        {triggers.map((t, j: number) => (
                          <ReadonlyField key={j} label={triggers.length > 1 ? `Trigger ${j + 1}` : 'Trigger'} value={interactionToText(t)} />
                        ))}
                      </>
                    )}
                    {def.buffs && def.buffs.length > 0 && def.buffs.map((b, j: number) => (
                      <ReadonlyField key={j} label={b.stat.replace(/_/g, ' ')} value={`${b.valueMin != null ? `${b.valueMin}\u2013${b.valueMax}` : b.value}${b.perStack ? ' /stack' : ''}`} />
                    ))}
                    {def.clause && def.clause.length > 0 && (
                      <ClauseTabs clause={def.clause as unknown[]} onTrigger={[]} onEntry={[]} onExit={[]} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </ReadonlySection>
      )}
      </div>
    </div>
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


function BuiltinGearSetView({ id }: { id: string }) {
  const gearSetData = getGearSetData(id);
  const registryPieces = getGearPiecesBySet(id);
  const passiveEntry = getGearSetEffects(id as GearSetType);
  const dslDefs = getGearEffectDefs(id);
  const rawEffect = useMemo(() => {
    const ef = getGearSetEffect(id);
    return ef ? ef.serialize() as Record<string, unknown> : null;
  }, [id]);
  const [activeTab, setActiveTab] = useState<string>(GearCategory.ARMOR);
  const [openEffects, setOpenEffects] = useState<Set<number>>(new Set());
  const [openPiece, setOpenPiece] = useState(-1);

  if (registryPieces.length === 0 && !gearSetData) return null;

  const pieces = [...(gearSetData?.pieces ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const piecesByCategory: Record<string, GearPieceData[]> = {};
  for (const p of pieces) {
    if (!piecesByCategory[p.gearCategory]) piecesByCategory[p.gearCategory] = [];
    piecesByCategory[p.gearCategory].push(p);
  }

  const iconMap: Record<string, string | undefined> = {};
  for (const rp of registryPieces) { iconMap[rp.name] = rp.icon; }

  const hasPassive = passiveEntry && Object.keys(passiveEntry.passiveStats).length > 0;
  const hasTriggered = dslDefs.length > 0;
  const setDesc = gearSetData?.setEffect?.description;
  const activePieces = piecesByCategory[activeTab] ?? [];

  return (
    <div className="ops-root ops-root--readonly ops-root--split">
      {/* ── LEFT: Set info ── */}
      <div className="ops-split-left">
        {/* Set effect */}
        {(hasPassive || hasTriggered || setDesc) && (
          <ReadonlySection label="GEAR SET EFFECT">
            {gearSetData?.setEffect?.piecesRequired && <ReadonlyField label="Pieces Required" value={String(gearSetData.setEffect.piecesRequired)} />}
            {setDesc && <ReadonlyField label="Description" value={setDesc} />}
            {hasPassive && Object.entries(passiveEntry!.passiveStats).map(([stat, val]) => (
              <ReadonlyField key={stat} label={stat.replace(/_/g, ' ')} value={`+${formatStatVal(stat, val as number)}`} />
            ))}
            {rawEffect && (
              <ClauseTabs
                clause={(rawEffect.clause ?? []) as unknown[]}
                onTrigger={(rawEffect.onTriggerClause ?? []) as unknown[]}
                onEntry={(rawEffect.onEntryClause ?? []) as unknown[]}
                onExit={(rawEffect.onExitClause ?? []) as unknown[]}
              />
            )}
          </ReadonlySection>
        )}

        {/* Triggered effects as cards */}
        {hasTriggered && (
          <ReadonlySection label="TRIGGERED EFFECTS">
            {dslDefs.map((def, i: number) => {
              const isOpen = openEffects.has(i);
              const triggers = resolveTriggerInteractions(def);
              return (
                <div key={i} className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`}>
                  <div className="ops-skill-card-header" onClick={() => setOpenEffects(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}>
                    <div className="ops-skill-card-header-content">
                      <div className="ops-skill-card-title-row">
                        <span className="ops-skill-card-index">{i + 1}</span>
                        <span className="ops-skill-card-name">{def.label ?? def.name}</span>
                        <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
                      </div>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="ops-skill-form">
                      <ReadonlyField label="Target" value={resolveTargetDisplay(def)} />
                      <ReadonlyField label="Duration" value={`${resolveDurationSeconds(def)}s`} />
                      <ReadonlyField label="Max Stacks" value={String(def.stack?.max?.P0 ?? 1)} />
                      {(def.cooldownSeconds ?? 0) > 0 && <ReadonlyField label="Cooldown" value={`${def.cooldownSeconds}s`} />}
                      {triggers.length > 0 && (
                        <>
                          <span className="ops-frame-prop-label" style={{ marginTop: '0.375rem' }}>Trigger Options</span>
                          {triggers.map((t, j: number) => (
                            <ReadonlyField key={j} label={`Trigger ${j + 1}`} value={interactionToText(t)} />
                          ))}
                        </>
                      )}
                      {def.buffs && def.buffs.length > 0 && def.buffs.map((b, j: number) => (
                        <ReadonlyField key={j} label={b.stat.replace(/_/g, ' ')} value={`+${b.value}${b.perStack ? ' /stack' : ''}`} />
                      ))}
                      {def.clause && def.clause.length > 0 && (
                        <ClauseTabs clause={def.clause as unknown[]} onTrigger={[]} onEntry={[]} onExit={[]} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </ReadonlySection>
        )}
      </div>

      {/* ── RIGHT: Pieces ── */}
      <div className="ops-split-right">
        <ReadonlySection label="PIECES">
        <div className="ops-skill-tabs ops-skill-tabs--sub">
          {GEAR_CATEGORY_ORDER.map((cat) => {
            const count = piecesByCategory[cat]?.length ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                type="button"
                className={`ops-skill-tab${activeTab === cat ? ' ops-skill-tab--active' : ''}`}
                onClick={() => { setActiveTab(cat); setOpenPiece(-1); }}
              >
                <span className="ops-skill-tab-label">{GEAR_CATEGORY_LABELS[cat]}</span>
              </button>
            );
          })}
        </div>
        {activePieces.map((p, pi) => {
          const isOpen = openPiece === pi;
          const ranks = Object.keys(p.allLevels).sort((a, b) => Number(a) - Number(b));
          const statKeys = ranks.length > 0 ? Object.keys(p.allLevels[ranks[0]]) : [];
          return (
            <div key={p.gearType} className={`ops-skill-card${isOpen ? ' ops-skill-card--open' : ''}`}>
              <div className="ops-skill-card-header" onClick={() => setOpenPiece(isOpen ? -1 : pi)}>
                {iconMap[p.name] && <img className="ops-skill-card-icon ops-skill-card-icon--no-invert" src={iconMap[p.name]} alt="" />}
                <div className="ops-skill-card-header-content">
                  <div className="ops-skill-card-title-row">
                    <span className="ops-skill-card-name">{p.name}</span>
                    <span className="ops-skill-card-chevron">{isOpen ? '\u25B4' : '\u25BE'}</span>
                  </div>
                </div>
              </div>
              {isOpen && (
                <div className="ops-skill-form">
                  <ReadonlyField label="Defense" value={String(p.defense)} />
                  {statKeys.length > 0 && (
                    <table className="ops-frame-vary-table" style={{ marginTop: '0.25rem' }}>
                      <thead>
                        <tr>
                          <th className="ops-frame-vary-header">Rank</th>
                          {ranks.map(r => <th key={r}>R{r}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {statKeys.map(stat => (
                          <tr key={stat}>
                            <td className="ops-frame-vary-header">{stat.replace(/_/g, ' ')}</td>
                            {ranks.map(r => <td key={r}>{formatStatVal(stat, p.allLevels[r][stat])}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
        </ReadonlySection>
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

  const jsonKey = SKILL_TYPE_TO_JSON_KEY[skillType];
  const typeMap = getTypedSkillTypeMap(opId);
  const resolvedSkillId = typeMap[jsonKey] ?? jsonKey;
  const skillObj = getOperatorSkill(opId, resolvedSkillId);
  const skillJson = skillObj ? skillObj.serialize() as Record<string, unknown> : undefined;

  // Variants
  const variants: { key: string; data: Record<string, unknown> }[] = [];
  const allSkills = getOperatorSkills(opId);
  if (allSkills) {
    allSkills.forEach((sk, k) => {
      if (k !== resolvedSkillId && k.includes(resolvedSkillId)) variants.push({ key: k, data: sk.serialize() as Record<string, unknown> });
    });
  }

  const hasSegments = skillJson?.segments && Array.isArray(skillJson.segments) && (skillJson.segments as unknown[]).length > 0;
  const hasFrames = skillJson?.frames && Array.isArray(skillJson.frames) && (skillJson.frames as unknown[]).length > 0;
  const statusEvents = getOperatorStatuses(opId).map(s => s.serialize() as Record<string, unknown>);

  return (
    <>
      <div className="ev-type-badge">{SKILL_TYPE_LABELS[skillType] ?? skillType}</div>
      <div className="ev-field-grid" style={{ marginTop: '0.5rem' }}>
        <Field label="Operator" value={op.name} />
        <Field label="Skill Key" value={skill.name} />
        {skill.element && <Field label="Element" value={skill.element} />}
      </div>
      {skill.description && (
        <GSection title="Description">
          <div className="ev-item-desc">{skill.description}</div>
        </GSection>
      )}
      <GSection title="Timings">
        <div className="ev-field-grid">
          {(() => {
            const segs = skill.defaultSegments ?? [];
            const totalDur = computeSegmentsSpan(segs);
            const activeSeg = segs.find(s => s.properties.segmentTypes?.includes(SegmentType.ACTIVE));
            const cooldownSeg = segs.find(s => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN));
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
        <div className="ev-field-grid">
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
                    {effects.map((e, i) => <code key={i} className="ev-code-tag">{effectToText(e)}</code>)}
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
                      {fEffects.map((e, i) => <code key={i} className="ev-code-tag">{effectToText(e)}</code>)}
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
                  <div className="ev-triggers">
                    <span className="ev-inline-label">Effects:</span>
                    {vEffects.map((e, i) => <code key={i} className="ev-code-tag">{effectToText(e)}</code>)}
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
              <div key={i} className="ev-item-card">
                <div className="ev-item-name">{String(se.id)}</div>
                <div className="ev-field-grid">
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
        <div key={i} className="ev-item-card">
          <div className="ev-item-name">{def.label ?? def.name}</div>
          <div className="ev-field-grid">
            <Field label="Target" value={resolveTargetDisplay(def)} />
            <Field label="Duration" value={`${resolveDurationSeconds(def)}s`} />
            <Field label="Max Stacks" value={String(def.stack?.max?.P0 ?? 1)} />
            {(def.cooldownSeconds ?? 0) > 0 && <Field label="Cooldown" value={`${def.cooldownSeconds}s`} />}
          </div>
          {resolveTriggerInteractions(def).length > 0 && (
            <div className="ev-triggers">
              <span className="ev-inline-label">Triggers:</span>
              {resolveTriggerInteractions(def).map((t, j: number) => <code key={j} className="ev-code-tag">{interactionToText(t)}</code>)}
            </div>
          )}
          {def.buffs && def.buffs.length > 0 && (
            <div className="ev-buffs">
              <span className="ev-inline-label">Buffs:</span>
              {def.buffs.map((b, j: number) => (
                <span key={j} className="ev-stat-tag">{b.stat} {b.valueMin != null ? `${b.valueMin}\u2013${b.valueMax}` : b.value}{b.perStack ? ' /stack' : ''}</span>
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
      <div className="ev-field-grid">
        <Field label="Operator" value={op.name} />
        <Field label="Slot" value={`Talent ${slot}`} />
        <Field label="Max Level" value={String(maxLevel)} />
      </div>
      {descriptions.length > 0 && (
        <GSection title="Level Descriptions">
          {descriptions.map((desc: string, i: number) => (
            <div key={i} className="ev-potential-row">
              <span className="ev-potential-num">Lv{i + 1}</span>
              <span className="ev-potential-desc">{desc}</span>
            </div>
          ))}
        </GSection>
      )}
    </>
  );
}
