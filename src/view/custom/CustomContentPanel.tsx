/**
 * Main panel for managing custom content (weapons, gear sets, operators).
 */
import { useState, useCallback } from 'react';
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
import CustomWeaponWizard from './CustomWeaponWizard';
import CustomGearWizard from './CustomGearWizard';
import CustomOperatorWizard from './CustomOperatorWizard';
import CustomSkillWizard from './CustomSkillWizard';

type Tab = 'weapons' | 'gears' | 'operators' | 'skills';

interface Props {
  onClose?: () => void;
  embedded?: boolean;
}

export default function CustomContentPanel({ onClose, embedded }: Props) {
  const [tab, setTab] = useState<Tab>('weapons');

  const [weapons, setWeapons] = useState<CustomWeapon[]>(() => getCustomWeapons());
  const [editingWeapon, setEditingWeapon] = useState<CustomWeapon | null>(null);
  const [isNewWeapon, setIsNewWeapon] = useState(false);
  const [originalWeaponId, setOriginalWeaponId] = useState('');

  const [gearSets, setGearSets] = useState<CustomGearSet[]>(() => getCustomGearSets());
  const [editingGear, setEditingGear] = useState<CustomGearSet | null>(null);
  const [isNewGear, setIsNewGear] = useState(false);
  const [originalGearId, setOriginalGearId] = useState('');

  const [operators, setOperators] = useState<CustomOperator[]>(() => getCustomOperators());
  const [editingOp, setEditingOp] = useState<CustomOperator | null>(null);
  const [isNewOp, setIsNewOp] = useState(false);
  const [originalOpId, setOriginalOpId] = useState('');

  const [skills, setSkills] = useState<CustomSkill[]>(() => getCustomSkills());
  const [editingSkill, setEditingSkill] = useState<CustomSkill | null>(null);
  const [isNewSkill, setIsNewSkill] = useState(false);
  const [originalSkillId, setOriginalSkillId] = useState('');

  const refreshWeapons = useCallback(() => setWeapons(getCustomWeapons()), []);
  const refreshGears = useCallback(() => setGearSets(getCustomGearSets()), []);
  const refreshOps = useCallback(() => setOperators(getCustomOperators()), []);
  const refreshSkills = useCallback(() => setSkills(getCustomSkills()), []);

  // ── Weapon handlers ─────────────────────────────────────────────────────

  const handleSaveWeapon = (weapon: CustomWeapon): string[] => {
    const errors = isNewWeapon ? createCustomWeapon(weapon) : updateCustomWeapon(originalWeaponId, weapon);
    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
    setEditingWeapon(null);
    refreshWeapons();
    return [];
  };

  // ── Gear handlers ───────────────────────────────────────────────────────

  const handleSaveGear = (gearSet: CustomGearSet): string[] => {
    const errors = isNewGear ? createCustomGearSet(gearSet) : updateCustomGearSet(originalGearId, gearSet);
    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
    setEditingGear(null);
    refreshGears();
    return [];
  };

  // ── Operator handlers ─────────────────────────────────────────────────

  const handleSaveOp = (operator: CustomOperator): string[] => {
    const errors = isNewOp ? createCustomOperator(operator) : updateCustomOperator(originalOpId, operator);
    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
    setEditingOp(null);
    refreshOps();
    return [];
  };

  // ── Skill handlers ──────────────────────────────────────────────────

  const handleSaveSkill = (skill: CustomSkill): string[] => {
    const errors = isNewSkill ? createCustomSkill(skill) : updateCustomSkill(originalSkillId, skill);
    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
    setEditingSkill(null);
    refreshSkills();
    return [];
  };

  // ── Active editing check ──────────────────────────────────────────────

  const isEditing = editingWeapon || editingGear || editingOp || editingSkill;

  return (
    <div className={`custom-panel${embedded ? ' custom-panel--embedded' : ''}`}>
      {!embedded && (
        <div className="custom-panel-header">
          <h2>Custom Content</h2>
          <button className="btn-close" onClick={onClose}>×</button>
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
        {/* ── Weapon editing ─────────────────────────────────────────────── */}
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
            {/* ── Weapons list ─────────────────────────────────────────── */}
            {tab === 'weapons' && (
              <ItemList
                items={weapons}
                labelFn={(w) => ({ name: w.name, meta: `${w.weaponRarity}★ ${w.weaponType}` })}
                onEdit={(w) => { setEditingWeapon(JSON.parse(JSON.stringify(w))); setIsNewWeapon(false); setOriginalWeaponId(w.id); }}
                onDuplicate={(w) => { const c = duplicateCustomWeapon(w.id); if (c) { setEditingWeapon(c); setIsNewWeapon(true); setOriginalWeaponId(c.id); } }}
                onDelete={(w) => { deleteCustomWeapon(w.id); refreshWeapons(); }}
                onCreate={() => { const d = getDefaultCustomWeapon(); setEditingWeapon(d); setIsNewWeapon(true); setOriginalWeaponId(d.id); }}
                createLabel="+ New Weapon"
              />
            )}

            {/* ── Gear sets list ────────────────────────────────────────── */}
            {tab === 'gears' && (
              <ItemList
                items={gearSets}
                labelFn={(g) => ({ name: g.setName, meta: `${g.rarity}★ · ${g.pieces.length} pieces` })}
                onEdit={(g) => { setEditingGear(JSON.parse(JSON.stringify(g))); setIsNewGear(false); setOriginalGearId(g.id); }}
                onDuplicate={(g) => { const c = duplicateCustomGearSet(g.id); if (c) { setEditingGear(c); setIsNewGear(true); setOriginalGearId(c.id); } }}
                onDelete={(g) => { deleteCustomGearSet(g.id); refreshGears(); }}
                onCreate={() => { const d = getDefaultCustomGearSet(); setEditingGear(d); setIsNewGear(true); setOriginalGearId(d.id); }}
                createLabel="+ New Gear Set"
              />
            )}

            {/* ── Operators list ────────────────────────────────────────── */}
            {tab === 'operators' && (
              <ItemList
                items={operators}
                labelFn={(o) => ({ name: o.name, meta: `${o.operatorRarity}★ ${o.operatorClassType} · ${o.elementType}` })}
                onEdit={(o) => { setEditingOp(JSON.parse(JSON.stringify(o))); setIsNewOp(false); setOriginalOpId(o.id); }}
                onDuplicate={(o) => { const c = duplicateCustomOperator(o.id); if (c) { setEditingOp(c); setIsNewOp(true); setOriginalOpId(c.id); } }}
                onDelete={(o) => { deleteCustomOperator(o.id); refreshOps(); }}
                onCreate={() => { const d = getDefaultCustomOperator(); setEditingOp(d); setIsNewOp(true); setOriginalOpId(d.id); }}
                createLabel="+ New Operator"
              />
            )}

            {/* ── Skills list ─────────────────────────────────────────── */}
            {tab === 'skills' && (
              <ItemList
                items={skills}
                labelFn={(s) => ({ name: s.name, meta: `${s.combatSkillType}${s.element ? ` · ${s.element}` : ''}` })}
                onEdit={(s) => { setEditingSkill(JSON.parse(JSON.stringify(s))); setIsNewSkill(false); setOriginalSkillId(s.id); }}
                onDuplicate={(s) => { const c = duplicateCustomSkill(s.id); if (c) { setEditingSkill(c); setIsNewSkill(true); setOriginalSkillId(c.id); } }}
                onDelete={(s) => { deleteCustomSkill(s.id); refreshSkills(); }}
                onCreate={() => { const d = getDefaultCustomSkill(); setEditingSkill(d); setIsNewSkill(true); setOriginalSkillId(d.id); }}
                createLabel="+ New Skill"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared item list component ──────────────────────────────────────────────

function ItemList<T extends { id: string }>({ items, labelFn, onEdit, onDuplicate, onDelete, onCreate, createLabel }: {
  items: T[];
  labelFn: (item: T) => { name: string; meta: string };
  onEdit: (item: T) => void;
  onDuplicate: (item: T) => void;
  onDelete: (item: T) => void;
  onCreate: () => void;
  createLabel: string;
}) {
  return (
    <div className="custom-list">
      {items.length === 0 && <div className="custom-empty">No custom items yet.</div>}
      {items.map((item) => {
        const { name, meta } = labelFn(item);
        return (
          <div key={item.id} className="custom-list-item">
            <div className="custom-list-info">
              <span className="custom-list-name">{name || '(unnamed)'}</span>
              <span className="custom-list-meta">{meta}</span>
            </div>
            <div className="custom-list-actions">
              <button className="btn-sm" onClick={() => onEdit(item)}>Edit</button>
              <button className="btn-sm" onClick={() => onDuplicate(item)}>Dup</button>
              <button className="btn-sm btn-danger" onClick={() => onDelete(item)}>Del</button>
            </div>
          </div>
        );
      })}
      <button className="btn-create" onClick={onCreate}>{createLabel}</button>
    </div>
  );
}
