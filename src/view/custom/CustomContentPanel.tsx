/**
 * Main panel for managing custom content (weapons, gear sets, operators).
 * Shows all items (built-in + custom) with right-click context menus.
 */
import { useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { CustomWeapon } from '../../model/custom/customWeaponTypes';
import type { CustomGearSet } from '../../model/custom/customGearTypes';
import type { CustomOperator } from '../../model/custom/customOperatorTypes';
import type { CustomSkill } from '../../model/custom/customSkillTypes';
import {
  getCustomWeapons, createCustomWeapon, updateCustomWeapon,
  deleteCustomWeapon, duplicateCustomWeapon, getDefaultCustomWeapon,
} from '../../controller/custom/customWeaponController';
import {
  getCustomGearSets, createCustomGearSet, updateCustomGearSet,
  deleteCustomGearSet, duplicateCustomGearSet, getDefaultCustomGearSet,
} from '../../controller/custom/customGearController';
import {
  getCustomOperators, createCustomOperator, updateCustomOperator,
  deleteCustomOperator, duplicateCustomOperator, getDefaultCustomOperator,
} from '../../controller/custom/customOperatorController';
import {
  getCustomSkills, createCustomSkill, updateCustomSkill,
  deleteCustomSkill, duplicateCustomSkill, getDefaultCustomSkill,
} from '../../controller/custom/customSkillController';
import {
  weaponToCustomWeapon,
  gearSetToCustomGearSet,
  operatorToCustomOperator,
} from '../../controller/custom/builtinToCustomConverter';
import { ALL_OPERATORS } from '../../controller/operators/operatorRegistry';
import { WEAPONS, GEARS } from '../../utils/loadoutRegistry';
import { GearSetType } from '../../consts/enums';
import CustomWeaponWizard from './CustomWeaponWizard';
import CustomGearWizard from './CustomGearWizard';
import CustomOperatorWizard from './CustomOperatorWizard';
import CustomSkillWizard from './CustomSkillWizard';
import ContextMenu from '../ContextMenu';
import type { ContextMenuItem, ContextMenuState } from '../../consts/viewTypes';

type Tab = 'weapons' | 'gears' | 'operators' | 'skills';
type SourceFilter = 'all' | 'base' | 'custom';

interface ManagedItem {
  id: string;
  name: string;
  meta: string;
  source: 'builtin' | 'custom';
  color?: string;
}

interface Props {
  onClose?: () => void;
  embedded?: boolean;
  onContentChanged?: () => void;
}

export default function CustomContentPanel({ onClose, embedded, onContentChanged }: Props) {
  const [tab, setTab] = useState<Tab>('weapons');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  const [customWeapons, setCustomWeapons] = useState<CustomWeapon[]>(() => getCustomWeapons());
  const [editingWeapon, setEditingWeapon] = useState<CustomWeapon | null>(null);
  const [isNewWeapon, setIsNewWeapon] = useState(false);
  const [originalWeaponId, setOriginalWeaponId] = useState('');

  const [customGears, setCustomGears] = useState<CustomGearSet[]>(() => getCustomGearSets());
  const [editingGear, setEditingGear] = useState<CustomGearSet | null>(null);
  const [isNewGear, setIsNewGear] = useState(false);
  const [originalGearId, setOriginalGearId] = useState('');

  const [customOperators, setCustomOperators] = useState<CustomOperator[]>(() => getCustomOperators());
  const [editingOp, setEditingOp] = useState<CustomOperator | null>(null);
  const [isNewOp, setIsNewOp] = useState(false);
  const [originalOpId, setOriginalOpId] = useState('');

  const [customSkills, setCustomSkills] = useState<CustomSkill[]>(() => getCustomSkills());
  const [editingSkill, setEditingSkill] = useState<CustomSkill | null>(null);
  const [isNewSkill, setIsNewSkill] = useState(false);
  const [originalSkillId, setOriginalSkillId] = useState('');

  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

  const refreshWeapons = useCallback(() => setCustomWeapons(getCustomWeapons()), []);
  const refreshGears = useCallback(() => setCustomGears(getCustomGearSets()), []);
  const refreshOps = useCallback(() => setCustomOperators(getCustomOperators()), []);
  const refreshSkills = useCallback(() => setCustomSkills(getCustomSkills()), []);

  // ── Build unified item lists ──────────────────────────────────────────────

  const customOpIds = useMemo(() => new Set(customOperators.map(o => `custom_${o.id}`)), [customOperators]);

  const operatorItems: ManagedItem[] = useMemo(() => {
    const base: ManagedItem[] = ALL_OPERATORS
      .filter(op => !customOpIds.has(op.id))
      .map(op => ({
        id: op.id,
        name: op.name,
        meta: `${op.rarity}\u2605 ${op.role} \u00B7 ${op.element}`,
        source: 'builtin' as const,
        color: op.color,
      }));
    const custom: ManagedItem[] = customOperators.map(o => ({
      id: o.id,
      name: o.name,
      meta: `${o.operatorRarity}\u2605 ${o.operatorClassType} \u00B7 ${o.elementType}`,
      source: 'custom' as const,
    }));
    return [...base, ...custom];
  }, [customOpIds, customOperators]);

  const weaponItems: ManagedItem[] = useMemo(() => {
    const customNames = new Set(customWeapons.map(w => w.name));
    const base: ManagedItem[] = WEAPONS
      .filter(w => !customNames.has(w.name))
      .map(w => ({
        id: w.name,
        name: w.name,
        meta: `${w.rarity}\u2605 ${w.weaponType.replace(/_/g, ' ')}`,
        source: 'builtin' as const,
      }));
    const custom: ManagedItem[] = customWeapons.map(w => ({
      id: w.id,
      name: w.name,
      meta: `${w.weaponRarity}\u2605 ${w.weaponType}`,
      source: 'custom' as const,
    }));
    return [...base, ...custom];
  }, [customWeapons]);

  const gearItems: ManagedItem[] = useMemo(() => {
    const seenSets = new Set<string>();
    const base: ManagedItem[] = [];
    for (const g of GEARS) {
      const key = g.gearSetType;
      if (key === 'NONE' || seenSets.has(key)) continue;
      seenSets.add(key);
      const setName = g.name.replace(/ (Heavy Armor|Light Armor|Exoskeleton|Gauntlets|Gloves|Poncho|Knife Kit|Radar|Tool Kit|Arm Kit|Combat Kit|Field Kit|Stealth Kit).*$/, '');
      base.push({
        id: key,
        name: setName,
        meta: `${g.rarity}\u2605`,
        source: 'builtin',
      });
    }
    const custom: ManagedItem[] = customGears.map(g => ({
      id: g.id,
      name: g.setName,
      meta: `${g.rarity}\u2605 \u00B7 ${g.pieces.length} pieces`,
      source: 'custom' as const,
    }));
    return [...base, ...custom];
  }, [customGears]);

  const skillItems: ManagedItem[] = useMemo(() => {
    const base: ManagedItem[] = [];
    for (const op of ALL_OPERATORS) {
      if (customOpIds.has(op.id)) continue;
      for (const [, skill] of Object.entries(op.skills)) {
        base.push({
          id: `skill:${op.id}:${skill.name}`,
          name: skill.name,
          meta: `${op.name} \u00B7 ${skill.element ?? ''}`,
          source: 'builtin',
          color: op.color,
        });
      }
    }
    const custom: ManagedItem[] = customSkills.map(s => ({
      id: s.id,
      name: s.name,
      meta: `${s.combatSkillType}${s.element ? ` \u00B7 ${s.element}` : ''}`,
      source: 'custom' as const,
    }));
    return [...base, ...custom];
  }, [customOpIds, customSkills]);

  // ── Get items for current tab ─────────────────────────────────────────────

  const currentItems = tab === 'operators' ? operatorItems
    : tab === 'weapons' ? weaponItems
    : tab === 'gears' ? gearItems
    : skillItems;

  const filteredItems = useMemo(() => {
    if (sourceFilter === 'all') return currentItems;
    return currentItems.filter(i => sourceFilter === 'base' ? i.source === 'builtin' : i.source === 'custom');
  }, [currentItems, sourceFilter]);

  // ── Save handlers ─────────────────────────────────────────────────────────

  const handleSaveWeapon = (weapon: CustomWeapon): string[] => {
    const errors = isNewWeapon ? createCustomWeapon(weapon) : updateCustomWeapon(originalWeaponId, weapon);
    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
    setEditingWeapon(null);
    refreshWeapons();
    onContentChanged?.();
    return [];
  };

  const handleSaveGear = (gearSet: CustomGearSet): string[] => {
    const errors = isNewGear ? createCustomGearSet(gearSet) : updateCustomGearSet(originalGearId, gearSet);
    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
    setEditingGear(null);
    refreshGears();
    onContentChanged?.();
    return [];
  };

  const handleSaveOp = (operator: CustomOperator): string[] => {
    const errors = isNewOp ? createCustomOperator(operator) : updateCustomOperator(originalOpId, operator);
    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
    setEditingOp(null);
    refreshOps();
    onContentChanged?.();
    return [];
  };

  const handleSaveSkill = (skill: CustomSkill): string[] => {
    const errors = isNewSkill ? createCustomSkill(skill) : updateCustomSkill(originalSkillId, skill);
    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
    setEditingSkill(null);
    refreshSkills();
    onContentChanged?.();
    return [];
  };

  // ── Context menu builder ──────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, item: ManagedItem) => {
    e.preventDefault();
    const items: ContextMenuItem[] = [];

    if (item.source === 'custom') {
      // Custom items: Edit, Duplicate, Delete
      if (tab === 'operators') {
        const co = customOperators.find(o => o.id === item.id);
        if (co) {
          items.push({ label: 'Edit', action: () => { setEditingOp(JSON.parse(JSON.stringify(co))); setIsNewOp(false); setOriginalOpId(co.id); } });
          items.push({ label: 'Duplicate', action: () => { const c = duplicateCustomOperator(co.id); if (c) { setEditingOp(c); setIsNewOp(true); setOriginalOpId(c.id); } } });
          items.push({ separator: true });
          items.push({ label: 'Delete', danger: true, action: () => { deleteCustomOperator(co.id); refreshOps(); onContentChanged?.(); } });
        }
      } else if (tab === 'weapons') {
        const cw = customWeapons.find(w => w.id === item.id);
        if (cw) {
          items.push({ label: 'Edit', action: () => { setEditingWeapon(JSON.parse(JSON.stringify(cw))); setIsNewWeapon(false); setOriginalWeaponId(cw.id); } });
          items.push({ label: 'Duplicate', action: () => { const c = duplicateCustomWeapon(cw.id); if (c) { setEditingWeapon(c); setIsNewWeapon(true); setOriginalWeaponId(c.id); } } });
          items.push({ separator: true });
          items.push({ label: 'Delete', danger: true, action: () => { deleteCustomWeapon(cw.id); refreshWeapons(); onContentChanged?.(); } });
        }
      } else if (tab === 'gears') {
        const cg = customGears.find(g => g.id === item.id);
        if (cg) {
          items.push({ label: 'Edit', action: () => { setEditingGear(JSON.parse(JSON.stringify(cg))); setIsNewGear(false); setOriginalGearId(cg.id); } });
          items.push({ label: 'Duplicate', action: () => { const c = duplicateCustomGearSet(cg.id); if (c) { setEditingGear(c); setIsNewGear(true); setOriginalGearId(c.id); } } });
          items.push({ separator: true });
          items.push({ label: 'Delete', danger: true, action: () => { deleteCustomGearSet(cg.id); refreshGears(); onContentChanged?.(); } });
        }
      } else if (tab === 'skills') {
        const cs = customSkills.find(s => s.id === item.id);
        if (cs) {
          items.push({ label: 'Edit', action: () => { setEditingSkill(JSON.parse(JSON.stringify(cs))); setIsNewSkill(false); setOriginalSkillId(cs.id); } });
          items.push({ label: 'Duplicate', action: () => { const c = duplicateCustomSkill(cs.id); if (c) { setEditingSkill(c); setIsNewSkill(true); setOriginalSkillId(c.id); } } });
          items.push({ separator: true });
          items.push({ label: 'Delete', danger: true, action: () => { deleteCustomSkill(cs.id); refreshSkills(); onContentChanged?.(); } });
        }
      }
    } else {
      // Built-in items: Clone as Custom only
      if (tab === 'operators') {
        items.push({ label: 'Clone as Custom', action: () => {
          const clone = operatorToCustomOperator(item.id);
          if (clone) { setEditingOp(clone); setIsNewOp(true); setOriginalOpId(clone.id); }
        }});
      } else if (tab === 'weapons') {
        items.push({ label: 'Clone as Custom', action: () => {
          const clone = weaponToCustomWeapon(item.id);
          if (clone) { setEditingWeapon(clone); setIsNewWeapon(true); setOriginalWeaponId(clone.id); }
        }});
      } else if (tab === 'gears') {
        items.push({ label: 'Clone as Custom', action: () => {
          const clone = gearSetToCustomGearSet(item.id as GearSetType);
          if (clone) { setEditingGear(clone); setIsNewGear(true); setOriginalGearId(clone.id); }
        }});
      }
      // Built-in skills: no context menu actions (they belong to operators)
      if (tab === 'skills') {
        items.push({ label: 'Base skill', disabled: true, disabledReason: 'Cannot modify built-in skills' });
      }
    }

    if (items.length > 0) {
      setCtxMenu({ x: e.clientX, y: e.clientY, items });
    }
  }, [tab, customOperators, customWeapons, customGears, customSkills, refreshOps, refreshWeapons, refreshGears, refreshSkills, onContentChanged]);

  // ── Create new handlers ───────────────────────────────────────────────────

  const handleCreate = useCallback(() => {
    if (tab === 'operators') {
      const d = getDefaultCustomOperator();
      setEditingOp(d); setIsNewOp(true); setOriginalOpId(d.id);
    } else if (tab === 'weapons') {
      const d = getDefaultCustomWeapon();
      setEditingWeapon(d); setIsNewWeapon(true); setOriginalWeaponId(d.id);
    } else if (tab === 'gears') {
      const d = getDefaultCustomGearSet();
      setEditingGear(d); setIsNewGear(true); setOriginalGearId(d.id);
    } else if (tab === 'skills') {
      const d = getDefaultCustomSkill();
      setEditingSkill(d); setIsNewSkill(true); setOriginalSkillId(d.id);
    }
  }, [tab]);

  const createLabel = tab === 'operators' ? '+ New Operator'
    : tab === 'weapons' ? '+ New Weapon'
    : tab === 'gears' ? '+ New Gear Set'
    : '+ New Skill';

  // ── Active editing check ──────────────────────────────────────────────────

  const isEditing = editingWeapon || editingGear || editingOp || editingSkill;

  return (
    <div className={`custom-panel${embedded ? ' custom-panel--embedded' : ''}`}>
      {!embedded && (
        <div className="custom-panel-header">
          <h2>Custom Content</h2>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>
      )}

      {!isEditing && (
        <div className="custom-tabs">
          <button className={`custom-tab${tab === 'weapons' ? ' active' : ''}`} onClick={() => setTab('weapons')}>Weapons</button>
          <button className={`custom-tab${tab === 'gears' ? ' active' : ''}`} onClick={() => setTab('gears')}>Gear Sets</button>
          <button className={`custom-tab${tab === 'operators' ? ' active' : ''}`} onClick={() => setTab('operators')}>Operators</button>
          <button className={`custom-tab${tab === 'skills' ? ' active' : ''}`} onClick={() => setTab('skills')}>Skills</button>
        </div>
      )}

      <div className="custom-panel-body">
        {editingSkill ? (
          <CustomSkillWizard
            initial={editingSkill}
            onSave={handleSaveSkill}
            onCancel={() => setEditingSkill(null)}
          />
        ) : editingWeapon ? (
          <CustomWeaponWizard
            initial={editingWeapon}
            onSave={handleSaveWeapon}
            onCancel={() => setEditingWeapon(null)}
          />
        ) : editingGear ? (
          <CustomGearWizard
            initial={editingGear}
            onSave={handleSaveGear}
            onCancel={() => setEditingGear(null)}
          />
        ) : editingOp ? (
          <CustomOperatorWizard
            initial={editingOp}
            onSave={handleSaveOp}
            onCancel={() => setEditingOp(null)}
          />
        ) : (
          <>
            {/* Source filter */}
            <div className="custom-source-filter">
              <button
                className={`custom-source-btn${sourceFilter === 'all' ? ' active' : ''}`}
                onClick={() => setSourceFilter('all')}
              >All</button>
              <button
                className={`custom-source-btn${sourceFilter === 'base' ? ' active' : ''}`}
                onClick={() => setSourceFilter('base')}
              >Base</button>
              <button
                className={`custom-source-btn${sourceFilter === 'custom' ? ' active' : ''}`}
                onClick={() => setSourceFilter('custom')}
              >Custom</button>
            </div>

            {/* Unified item list */}
            <div className="custom-list">
              {filteredItems.length === 0 && (
                <div className="custom-empty">No items found.</div>
              )}
              {filteredItems.map((item) => (
                <div
                  key={`${item.source}:${item.id}`}
                  className={`custom-list-item${item.source === 'custom' ? ' custom-list-item--custom' : ''}`}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  {item.color && (
                    <span className="custom-list-dot" style={{ background: item.color }} />
                  )}
                  <div className="custom-list-info">
                    <span className="custom-list-name">{item.name || '(unnamed)'}</span>
                    <span className="custom-list-meta">{item.meta}</span>
                  </div>
                  {item.source === 'custom' && (
                    <span className="custom-list-badge">custom</span>
                  )}
                </div>
              ))}
              <button className="btn-create" onClick={handleCreate}>{createLabel}</button>
            </div>
          </>
        )}
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
