import { lazy, Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useApp } from './app/useApp';
import AppBar from './view/AppBar';
import { buildShareUrl, detectCustomContent } from './utils/embedCodec';
import LoadoutSidebar from './view/LoadoutSidebar';
import type { SidebarMode } from './view/LoadoutSidebar';
import { ContentCategory } from './consts/contentBrowserTypes';
import type { ContentSelection } from './consts/contentBrowserTypes';
import { weaponToCustomWeapon, gearSetToCustomGearSet, operatorToCustomOperator } from './controller/custom/builtinToCustomConverter';
import { ALL_OPERATORS, operatorWarnings } from './controller/operators/operatorRegistry';
import { COMBAT_SKILL_LABELS } from './consts/timelineColumnLabels';
import { createCustomWeapon, getDefaultCustomWeapon, updateCustomWeapon, getCustomWeapons } from './controller/custom/customWeaponController';
import { createCustomGearSet, getDefaultCustomGearSet, updateCustomGearSet, getCustomGearSets } from './controller/custom/customGearController';
import { createCustomOperator, getDefaultCustomOperator, updateCustomOperator, getCustomOperators } from './controller/custom/customOperatorController';
import { createCustomSkill, getDefaultCustomSkill, updateCustomSkill, getCustomSkills } from './controller/custom/customSkillController';
import { createCustomWeaponEffect, updateCustomWeaponEffect, getCustomWeaponEffects, getDefaultCustomWeaponEffect } from './controller/custom/customWeaponEffectController';
import { createCustomGearEffect, updateCustomGearEffect, getCustomGearEffects, getDefaultCustomGearEffect } from './controller/custom/customGearEffectController';
import { createCustomOperatorStatus, updateCustomOperatorStatus, getCustomOperatorStatuses, getDefaultCustomOperatorStatus } from './controller/custom/customOperatorStatusController';
import { createCustomOperatorTalent, updateCustomOperatorTalent, getCustomOperatorTalents, getDefaultCustomOperatorTalent } from './controller/custom/customOperatorTalentController';
import { addSkillLink } from './controller/custom/customSkillLinkController';
import { clearAllCustomContent } from './utils/customContentStorage';
import { InteractionModeType } from './consts/enums';
import type { GearSetType } from './consts/enums';
import ContextMenu from './view/ContextMenu';
import WarningModal from './view/WarningModal';
import ConfirmModal from './view/ConfirmModal';
import './App.css';

const CombatPlanner = lazy(() => import('./view/CombatPlanner'));
const CombatSheet = lazy(() => import('./view/CombatSheet'));
const InformationPane = lazy(() => import('./view/InformationPane'));
const DevlogModal = lazy(() => import('./view/DevlogModal'));
const ExportModal = lazy(() => import('./view/ExportModal'));
const KeyboardShortcutsModal = lazy(() => import('./view/KeyboardShortcutsModal'));
const CustomContentPanel = lazy(() => import('./view/custom/CustomContentPanel'));
const ContentViewer = lazy(() => import('./view/custom/ContentViewer'));
const CustomWeaponWizard = lazy(() => import('./view/custom/CustomWeaponWizard'));
const CustomGearWizard = lazy(() => import('./view/custom/CustomGearWizard'));
const CustomOperatorWizard = lazy(() => import('./view/custom/CustomOperatorWizard'));
const CustomSkillWizard = lazy(() => import('./view/custom/CustomSkillWizard'));
const ClauseEditorModal = lazy(() => import('./view/custom/ClauseEditorModal'));
const UnifiedCustomizer = lazy(() => import('./view/custom/UnifiedCustomizer'));

const UI_STATE_KEY = 'zst-ui-state';

interface UiState {
  sidebarMode: SidebarMode;
  customPageActive: boolean;
}

function loadUiState(): UiState {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          sidebarMode: parsed.sidebarMode === 'custom' ? 'custom' : parsed.sidebarMode === 'workbench' ? 'workbench' : 'loadouts',
          customPageActive: !!parsed.customPageActive,
        };
      }
    }
  } catch { /* ignore */ }
  return { sidebarMode: 'loadouts', customPageActive: false };
}

function saveUiState(state: UiState): void {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export default function App() {
  const app = useApp();
  const [expandAnim, setExpandAnim] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => loadUiState().sidebarMode);
  const [customPageActive, setCustomPageActive] = useState(() => loadUiState().customPageActive);
  const [editingContent, setEditingContent] = useState<ContentSelection | null>(null);
  const [pendingClone, setPendingClone] = useState<{ category: ContentCategory; data: any } | null>(null);
  const [workbenchOpen, setWorkbenchOpen] = useState(() => loadUiState().sidebarMode === 'workbench');
  const [workbenchInitial, setWorkbenchInitial] = useState<{ entityType: ContentCategory; data: any } | undefined>();
  const [confirmClearCustom, setConfirmClearCustom] = useState(false);
  const [contentRefreshKey, setContentRefreshKey] = useState(0);
  const bumpContentRefresh = useCallback(() => setContentRefreshKey((k) => k + 1), []);
  const draggedRef = useRef(false);

  // Show warnings for operators that failed to load
  useEffect(() => {
    if (operatorWarnings.length === 0) return;
    const userWarnings = operatorWarnings.filter((w) => !w.isBuiltIn);
    const devWarnings = operatorWarnings.filter((w) => w.isBuiltIn);
    // Dev warnings go to console only
    for (const w of devWarnings) console.warn(w.message);
    // User warnings show in the UI
    if (userWarnings.length > 0) {
      app.setWarningMessage(userWarnings.map((w) => w.message).join('\n\n'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist UI selection state on change
  useEffect(() => {
    saveUiState({ sidebarMode, customPageActive });
  }, [sidebarMode, customPageActive]);

  const handleRestore = useCallback(() => {
    if (draggedRef.current) { draggedRef.current = false; return; }
    setExpandAnim(true);
    app.handleRestorePane();
    setTimeout(() => setExpandAnim(false), 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.handleRestorePane]);

  const isCustomPage = customPageActive;

  const handleCloneContentAsCustom = useCallback((item: ContentSelection) => {
    let cloned: any = null;
    let targetCategory = item.category;
    if (item.category === ContentCategory.WEAPONS) {
      cloned = weaponToCustomWeapon(item.id);
    } else if (item.category === ContentCategory.GEAR_SETS) {
      cloned = gearSetToCustomGearSet(item.id as GearSetType);
    } else if (item.category === ContentCategory.OPERATORS) {
      cloned = operatorToCustomOperator(item.id);
    } else if (item.category === ContentCategory.SKILLS) {
      const parts = item.id.split(':');
      const opId = parts[1];
      const skillType = parts[2] as 'basic' | 'battle' | 'combo' | 'ultimate';
      const op = ALL_OPERATORS.find((o: any) => o.id === opId);
      if (op) {
        const skill = op.skills[skillType];
        const totalFrames = skill.defaultActivationDuration + skill.defaultActiveDuration;
        cloned = {
          id: `skill_clone_${Date.now()}`,
          name: `${(COMBAT_SKILL_LABELS as any)[skill.name] || skill.name} (Clone)`,
          combatSkillType: skillType === 'basic' ? 'BASIC_ATTACK' : skillType === 'battle' ? 'BATTLE_SKILL' : skillType === 'combo' ? 'COMBO_SKILL' : 'ULTIMATE',
          element: skill.element || undefined,
          durationSeconds: Math.max(totalFrames / 120, 0.1),
          cooldownSeconds: skill.defaultCooldownDuration > 0 ? skill.defaultCooldownDuration / 120 : undefined,
          animationSeconds: skill.animationDuration ? skill.animationDuration / 120 : undefined,
          description: skill.description,
          resourceInteractions: skill.skillPointCost ? [{ resourceType: 'SKILL_POINT', verb: 'CONSUME', value: skill.skillPointCost }] : undefined,
        };
        targetCategory = ContentCategory.SKILLS;
      }
    }
    if (cloned) {
      setPendingClone({ category: targetCategory, data: cloned });
      setEditingContent(null);
    }
  }, []);

  const handleEditCustomContent = useCallback((item: ContentSelection) => {
    if (item.id === '__new__') {
      // Create new custom item
      let newItem: any = null;
      if (item.category === ContentCategory.OPERATORS) {
        newItem = getDefaultCustomOperator();
      } else if (item.category === ContentCategory.WEAPONS) {
        newItem = getDefaultCustomWeapon();
      } else if (item.category === ContentCategory.GEAR_SETS) {
        newItem = getDefaultCustomGearSet();
      } else if (item.category === ContentCategory.SKILLS) {
        newItem = getDefaultCustomSkill();
      } else if (item.category === ContentCategory.WEAPON_EFFECTS) {
        newItem = getDefaultCustomWeaponEffect();
        setWorkbenchInitial({ entityType: item.category, data: newItem });
        setWorkbenchOpen(true);
        setSidebarMode('workbench');
        return;
      } else if (item.category === ContentCategory.GEAR_EFFECTS) {
        newItem = getDefaultCustomGearEffect();
        setWorkbenchInitial({ entityType: item.category, data: newItem });
        setWorkbenchOpen(true);
        setSidebarMode('workbench');
        return;
      } else if (item.category === ContentCategory.OPERATOR_STATUSES) {
        newItem = getDefaultCustomOperatorStatus();
        setWorkbenchInitial({ entityType: item.category, data: newItem });
        setWorkbenchOpen(true);
        setSidebarMode('workbench');
        return;
      } else if (item.category === ContentCategory.OPERATOR_TALENTS) {
        newItem = getDefaultCustomOperatorTalent();
        setWorkbenchInitial({ entityType: item.category, data: newItem });
        setWorkbenchOpen(true);
        setSidebarMode('workbench');
        return;
      }
      if (newItem) {
        setPendingClone({ category: item.category, data: newItem });
        setEditingContent(null);
      }
    } else {
      // New entity types open in workbench for editing
      const workbenchCategories = new Set([
        ContentCategory.WEAPON_EFFECTS,
        ContentCategory.GEAR_EFFECTS,
        ContentCategory.OPERATOR_STATUSES,
        ContentCategory.OPERATOR_TALENTS,
      ]);
      if (workbenchCategories.has(item.category)) {
        let existingData: any = null;
        if (item.category === ContentCategory.WEAPON_EFFECTS) {
          existingData = getCustomWeaponEffects().find((e) => e.id === item.id);
        } else if (item.category === ContentCategory.GEAR_EFFECTS) {
          existingData = getCustomGearEffects().find((e) => e.id === item.id);
        } else if (item.category === ContentCategory.OPERATOR_STATUSES) {
          existingData = getCustomOperatorStatuses().find((s) => s.id === item.id);
        } else if (item.category === ContentCategory.OPERATOR_TALENTS) {
          existingData = getCustomOperatorTalents().find((t) => t.id === item.id);
        }
        if (existingData) {
          setWorkbenchInitial({ entityType: item.category, data: JSON.parse(JSON.stringify(existingData)) });
          setWorkbenchOpen(true);
          setSidebarMode('workbench');
        }
      } else {
        // Edit existing custom item — select it so the CustomContentPanel shows it
        setEditingContent(item);
      }
    }
  }, []);

  const handleWorkbenchSave = useCallback((type: ContentCategory, data: any): string[] => {
    let errors: import('./utils/customContentStorage').ValidationError[] = [];
    const isEdit = workbenchInitial?.entityType === type && workbenchInitial?.data?.id === data.id;
    if (type === ContentCategory.OPERATORS) {
      errors = isEdit ? updateCustomOperator(data.id, data) : createCustomOperator(data);
    } else if (type === ContentCategory.WEAPONS) {
      errors = isEdit ? updateCustomWeapon(data.id, data) : createCustomWeapon(data);
    } else if (type === ContentCategory.GEAR_SETS) {
      errors = isEdit ? updateCustomGearSet(data.id, data) : createCustomGearSet(data);
    } else if (type === ContentCategory.SKILLS) {
      errors = isEdit ? updateCustomSkill(data.id, data) : createCustomSkill(data);
    } else if (type === ContentCategory.WEAPON_EFFECTS) {
      errors = isEdit ? updateCustomWeaponEffect(data.id, data) : createCustomWeaponEffect(data);
    } else if (type === ContentCategory.GEAR_EFFECTS) {
      errors = isEdit ? updateCustomGearEffect(data.id, data) : createCustomGearEffect(data);
    } else if (type === ContentCategory.OPERATOR_STATUSES) {
      errors = isEdit ? updateCustomOperatorStatus(data.id, data) : createCustomOperatorStatus(data);
    } else if (type === ContentCategory.OPERATOR_TALENTS) {
      errors = isEdit ? updateCustomOperatorTalent(data.id, data) : createCustomOperatorTalent(data);
    }
    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
    setWorkbenchOpen(false);
    setWorkbenchInitial(undefined);
    bumpContentRefresh();
    return [];
  }, [workbenchInitial, bumpContentRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const COLUMN_TO_SKILL_TYPE: Record<string, string> = {
    basic: 'BASIC_ATTACK', battle: 'BATTLE_SKILL', combo: 'COMBO_SKILL', ultimate: 'ULTIMATE',
  };

  const handleSaveAsCustomSkill = useCallback((event: import('./consts/viewTypes').TimelineEvent) => {
    const skillType = COLUMN_TO_SKILL_TYPE[event.columnId];
    if (!skillType) return;

    const id = `skill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const label = (COMBAT_SKILL_LABELS as any)[event.name] || event.name;
    const skill: import('./model/custom/customSkillTypes').CustomSkill = {
      id,
      name: `${label} (Custom)`,
      combatSkillType: skillType as any,
      durationSeconds: (event.activationDuration ?? 0) / 120,
      cooldownSeconds: (event.cooldownDuration ?? 0) / 120 || undefined,
      animationSeconds: (event.animationDuration ?? 0) / 120 || undefined,
    };

    const errors = createCustomSkill(skill);
    if (errors.length > 0) return;

    addSkillLink(event.ownerId, event.columnId as any, id);
    bumpContentRefresh();
    app.bumpCustomSkillVersion();
  }, [bumpContentRefresh, app.bumpCustomSkillVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      <AppBar
        activeLoadoutName={app.loadoutTree.nodes.find((n) => n.id === app.activeLoadoutId)?.name ?? ''}
        onRenameLoadout={app.handleRenameActiveLoadout}
        onClearLoadout={() => isCustomPage ? setConfirmClearCustom(true) : app.setConfirmClearLoadout(true)}
        onClearAll={() => app.setConfirmClearAll(true)}
        onExport={app.handleExport}
        onImport={app.handleImport}
        onShare={async () => {
          const sheetData = app.buildSheetData();
          const warning = detectCustomContent(sheetData);
          if (warning) app.setWarningMessage(warning);
          return buildShareUrl(sheetData, app.columns, app.loadoutTree.nodes.find((n) => n.id === app.activeLoadoutId)?.name ?? 'Shared Loadout');
        }}
        onDevlog={() => app.setDevlogOpen(true)}
        onKeys={() => app.setKeysOpen((p) => !p)}
        onCustomContent={() => {
          setCustomPageActive(true);
          setSidebarMode('custom');
        }}
        onClauseEditor={() => app.setClauseEditorOpen(true)}
        interactionMode={app.interactionMode}
        onToggleInteractionMode={() => app.setInteractionMode(m => m === InteractionModeType.STRICT ? InteractionModeType.FREEFORM : InteractionModeType.STRICT)}
        lightMode={app.lightMode}
        onToggleTheme={app.handleToggleTheme}
      />

      <div ref={app.appBodyRef} className="app-body" style={{ '--tl-flex': `${app.splitPct} 0 0`, '--sheet-flex': `${100 - app.splitPct} 0 0` } as React.CSSProperties}>
        <LoadoutSidebar
          ref={app.sidebarRef}
          tree={app.loadoutTree}
          activeLoadoutId={app.activeLoadoutId}
          onTreeChange={app.handleLoadoutTreeChange}
          onSelectLoadout={app.handleSelectLoadout}
          onNewLoadout={app.handleNewLoadout}
          onDuplicateLoadout={app.handleDuplicateLoadout}
          onDeleteLoadout={app.handleDeleteLoadout}
          onWarning={app.setWarningMessage}
          sidebarMode={sidebarMode}
          onSidebarModeChange={(mode) => {
            setSidebarMode(mode);
            if (mode === 'loadouts') {
              setCustomPageActive(false);
              setEditingContent(null);
              setPendingClone(null);
              setWorkbenchOpen(false);
            } else if (mode === 'custom') {
              setCustomPageActive(true);
              setWorkbenchOpen(false);
            } else if (mode === 'workbench') {
              setCustomPageActive(false);
              setWorkbenchOpen(true);
              if (!workbenchInitial) setWorkbenchInitial(undefined);
            }
          }}
          selectedContentItem={editingContent}
          onSelectContentItem={setEditingContent}
          onCloneContentAsCustom={handleCloneContentAsCustom}
          onEditCustomContent={handleEditCustomContent}
          onOpenInWorkbench={(item) => {
            // For V1 types, find existing data and open in workbench
            let existingData: any = null;
            if (item.category === ContentCategory.OPERATORS) {
              existingData = getCustomOperators().find((o) => o.id === item.id);
            } else if (item.category === ContentCategory.WEAPONS) {
              existingData = getCustomWeapons().find((w) => w.id === item.id);
            } else if (item.category === ContentCategory.GEAR_SETS) {
              existingData = getCustomGearSets().find((g) => g.id === item.id);
            } else if (item.category === ContentCategory.SKILLS) {
              existingData = getCustomSkills().find((s) => s.id === item.id);
            } else if (item.category === ContentCategory.WEAPON_EFFECTS) {
              existingData = getCustomWeaponEffects().find((e) => e.id === item.id);
            } else if (item.category === ContentCategory.GEAR_EFFECTS) {
              existingData = getCustomGearEffects().find((e) => e.id === item.id);
            } else if (item.category === ContentCategory.OPERATOR_STATUSES) {
              existingData = getCustomOperatorStatuses().find((s) => s.id === item.id);
            } else if (item.category === ContentCategory.OPERATOR_TALENTS) {
              existingData = getCustomOperatorTalents().find((t) => t.id === item.id);
            }
            if (existingData) {
              setWorkbenchInitial({ entityType: item.category, data: JSON.parse(JSON.stringify(existingData)) });
              setWorkbenchOpen(true);
              setSidebarMode('workbench');
            }
          }}
          onContentChanged={bumpContentRefresh}
          contentRefreshKey={contentRefreshKey}
        />

        {workbenchOpen && sidebarMode === 'workbench' ? (
          <Suspense fallback={<div className="tl-loading" style={{ flex: 1 }} />}>
            <UnifiedCustomizer
              initial={workbenchInitial}
              onSave={handleWorkbenchSave}
              onCancel={() => {
                setWorkbenchOpen(false);
                setSidebarMode('loadouts');
              }}
              onContentChanged={bumpContentRefresh}
              contentRefreshKey={contentRefreshKey}
            />
          </Suspense>
        ) : isCustomPage ? (
          <Suspense fallback={<div className="tl-loading" style={{ flex: 1 }} />}>
            {pendingClone ? (
              pendingClone.category === ContentCategory.WEAPONS ? (
                <CustomWeaponWizard
                  initial={pendingClone.data}
                  onSave={(weapon) => {
                    const errors = createCustomWeapon(weapon);
                    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
                    setPendingClone(null);
                    bumpContentRefresh();
                    return [];
                  }}
                  onCancel={() => setPendingClone(null)}
                />
              ) : pendingClone.category === ContentCategory.GEAR_SETS ? (
                <CustomGearWizard
                  initial={pendingClone.data}
                  onSave={(gearSet) => {
                    const errors = createCustomGearSet(gearSet);
                    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
                    setPendingClone(null);
                    bumpContentRefresh();
                    return [];
                  }}
                  onCancel={() => setPendingClone(null)}
                />
              ) : pendingClone.category === ContentCategory.OPERATORS ? (
                <CustomOperatorWizard
                  initial={pendingClone.data}
                  onSave={(operator) => {
                    const errors = createCustomOperator(operator);
                    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
                    setPendingClone(null);
                    bumpContentRefresh();
                    return [];
                  }}
                  onCancel={() => setPendingClone(null)}
                />
              ) : pendingClone.category === ContentCategory.SKILLS ? (
                <CustomSkillWizard
                  initial={pendingClone.data}
                  onSave={(skill) => {
                    const errors = createCustomSkill(skill);
                    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
                    setPendingClone(null);
                    bumpContentRefresh();
                    return [];
                  }}
                  onCancel={() => setPendingClone(null)}
                />
              ) : null
            ) : editingContent && editingContent.source === 'custom' ? (
              (() => {
                if (editingContent.category === ContentCategory.WEAPONS) {
                  const cw = getCustomWeapons().find((w) => w.id === editingContent.id);
                  if (!cw) return null;
                  return (
                    <CustomWeaponWizard
                      initial={JSON.parse(JSON.stringify(cw))}
                      onSave={(weapon) => {
                        const errors = updateCustomWeapon(editingContent.id, weapon);
                        if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
                        bumpContentRefresh();
                        return [];
                      }}
                      onCancel={() => setEditingContent(null)}
                    />
                  );
                } else if (editingContent.category === ContentCategory.GEAR_SETS) {
                  const cg = getCustomGearSets().find((g) => g.id === editingContent.id);
                  if (!cg) return null;
                  return (
                    <CustomGearWizard
                      initial={JSON.parse(JSON.stringify(cg))}
                      onSave={(gearSet) => {
                        const errors = updateCustomGearSet(editingContent.id, gearSet);
                        if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
                        bumpContentRefresh();
                        return [];
                      }}
                      onCancel={() => setEditingContent(null)}
                    />
                  );
                } else if (editingContent.category === ContentCategory.OPERATORS) {
                  const co = getCustomOperators().find((o) => o.id === editingContent.id);
                  if (!co) return null;
                  return (
                    <CustomOperatorWizard
                      initial={JSON.parse(JSON.stringify(co))}
                      onSave={(operator) => {
                        const errors = updateCustomOperator(editingContent.id, operator);
                        if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
                        bumpContentRefresh();
                        return [];
                      }}
                      onCancel={() => setEditingContent(null)}
                    />
                  );
                } else if (editingContent.category === ContentCategory.SKILLS) {
                  const cs = getCustomSkills().find((s) => s.id === editingContent.id);
                  if (!cs) return null;
                  return (
                    <CustomSkillWizard
                      initial={JSON.parse(JSON.stringify(cs))}
                      onSave={(skill) => {
                        const errors = updateCustomSkill(editingContent.id, skill);
                        if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
                        bumpContentRefresh();
                        return [];
                      }}
                      onCancel={() => setEditingContent(null)}
                    />
                  );
                }
                return null;
              })()
            ) : editingContent && editingContent.source === 'builtin' ? (
              <ContentViewer
                selection={editingContent}
                onCloneAsCustom={() => {
                  let cloned: any = null;
                  let targetCategory = editingContent.category;
                  if (editingContent.category === ContentCategory.WEAPONS) {
                    cloned = weaponToCustomWeapon(editingContent.id);
                    targetCategory = ContentCategory.WEAPONS;
                  } else if (editingContent.category === ContentCategory.GEAR_SETS) {
                    cloned = gearSetToCustomGearSet(editingContent.id as GearSetType);
                    targetCategory = ContentCategory.GEAR_SETS;
                  } else if (editingContent.category === ContentCategory.OPERATORS) {
                    cloned = operatorToCustomOperator(editingContent.id);
                    targetCategory = ContentCategory.OPERATORS;
                  } else if (editingContent.category === ContentCategory.SKILLS) {
                    // id format: "skill:{operatorId}:{skillType}"
                    const parts = editingContent.id.split(':');
                    const opId = parts[1];
                    const skillType = parts[2] as 'basic' | 'battle' | 'combo' | 'ultimate';
                    const op = ALL_OPERATORS.find((o: any) => o.id === opId);
                    if (op) {
                      const skill = op.skills[skillType];
                      const totalFrames = skill.defaultActivationDuration + skill.defaultActiveDuration;
                      cloned = {
                        id: `skill_clone_${Date.now()}`,
                        name: `${(COMBAT_SKILL_LABELS as any)[skill.name] || skill.name} (Clone)`,
                        combatSkillType: skillType === 'basic' ? 'BASIC_ATTACK' : skillType === 'battle' ? 'BATTLE_SKILL' : skillType === 'combo' ? 'COMBO_SKILL' : 'ULTIMATE',
                        element: skill.element || undefined,
                        durationSeconds: Math.max(totalFrames / 120, 0.1),
                        cooldownSeconds: skill.defaultCooldownDuration > 0 ? skill.defaultCooldownDuration / 120 : undefined,
                        animationSeconds: skill.animationDuration ? skill.animationDuration / 120 : undefined,
                        description: skill.description,
                        resourceInteractions: skill.skillPointCost ? [{ resourceType: 'SKILL_POINT', verb: 'CONSUME', value: skill.skillPointCost }] : undefined,
                      };
                      targetCategory = ContentCategory.SKILLS;
                    }
                  }
                  if (cloned) {
                    setPendingClone({ category: targetCategory, data: cloned });
                    setEditingContent(null);
                  }
                }}
              />
            ) : (
              <CustomContentPanel embedded onContentChanged={bumpContentRefresh} />
            )}
          </Suspense>
        ) : (
          <>
            {app.hiddenPane !== 'left' && (
              <Suspense fallback={<div className="tl-loading" />}>
                <div className="pane-wrapper" style={{ flex: app.hiddenPane === 'right' ? '1' : 'var(--tl-flex, 1)', minWidth: 0 }}>
                  <CombatPlanner
                    slots={app.slots}
                    enemy={app.enemy}
                    events={app.allProcessedEvents}
                    columns={app.columns}
                    visibleSkills={app.visibleSkills}
                    loadouts={app.loadouts}
                    zoom={app.zoom}
                    onZoom={app.handleZoom}
                    orientation={app.orientation}
                    onToggleOrientation={app.handleToggleOrientation}
                    onToggleSkill={app.handleToggleSkill}
                    onAddEvent={app.handleAddEvent}
                    onMoveEvent={app.handleMoveEvent}
                    onMoveEvents={app.handleMoveEvents}
                    onContextMenu={app.setContextMenu}
                    onEditEvent={app.handleEditEvent}
                    onRemoveEvent={app.handleRemoveEvent}
                    onRemoveEvents={app.handleRemoveEvents}
                    onResetEvent={app.handleResetEvent}
                    onResetEvents={app.handleResetEvents}
                    onResetSegments={app.handleResetSegments}
                    onResetFrames={app.handleResetFrames}
                    onLoadoutChange={app.handleLoadoutChange}
                    onEditLoadout={app.handleEditLoadout}
                    allOperators={app.allOperators}
                    onSwapOperator={app.handleSwapOperator}
                    allEnemies={app.allEnemies}
                    onSwapEnemy={app.handleSwapEnemy}
                    onEditEnemy={app.handleEditEnemy}
                    resourceGraphs={app.resourceGraphs}
                    onEditResource={app.handleEditResource}
                    onBatchStart={app.beginBatch}
                    onBatchEnd={app.endBatch}
                    onFrameClick={app.handleFrameClick}
                    onRemoveFrame={app.handleRemoveFrame}
                    onRemoveFrames={app.handleRemoveFrames}
                    onRemoveSegment={app.handleRemoveSegment}
                    onAddSegment={app.handleAddSegment}
                    onAddFrame={app.handleAddFrame}
                    onMoveFrame={app.handleMoveFrame}
                    selectedFrames={app.selectedFrames}
                    onSelectedFramesChange={app.setSelectedFrames}
                    onLoadoutRowHeight={app.setLoadoutRowHeight}
                    onHeaderRowHeight={app.setHeaderRowHeight}
                    onScrollRef={app.handleTlScrollRef}
                    onScroll={app.handleTimelineScroll}
                    onHoverFrame={app.setHoverFrame}
                    hideScrollbar={app.scrollSynced}
                    onDuplicateEvents={app.handleDuplicateEvents}
                    selectEventIds={app.selectEventIds}
                    onSelectEventIdsConsumed={() => app.setSelectEventIds(undefined)}
                    showRealTime={app.showRealTime}
                    onToggleRealTime={() => app.setShowRealTime((v) => !v)}
                    interactionMode={app.interactionMode}
                    staggerBreaks={app.staggerBreaks}
                    contentFrames={app.contentFrames}
                    spInsufficiencyZones={app.spInsufficiencyZones}
                  />
                  {(app.hidePreview === 'left' || app.showPreview === 'left') && (
                    <div className="pane-hide-overlay">
                      <svg className="pane-hide-icon" viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                        {app.hidePreview === 'left' ? (
                          <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                        ) : (
                          <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                        )}
                      </svg>
                    </div>
                  )}
                </div>
              </Suspense>
            )}

            <div
              className={`panel-resizer${app.scrollSynced ? ' panel-resizer--synced' : ''}${app.hiddenPane ? ' panel-resizer--collapsed' : ''}${expandAnim ? ' panel-resizer--expanding' : ''}`}
              onMouseDown={(e) => {
                const onUp = () => { draggedRef.current = true; window.removeEventListener('mouseup', onUp); };
                window.addEventListener('mouseup', onUp);
                app.handleResizerMouseDown(e);
              }}
              onClick={app.hiddenPane ? handleRestore : undefined}
              title={app.hiddenPane === 'left' ? 'Show planner' : app.hiddenPane === 'right' ? 'Show sheet' : 'Drag to resize'}
            >
              <svg className="panel-resizer-grip" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
              </svg>
              {!app.hiddenPane && (
                <div className="panel-resizer-buttons">
                  {app.orientation !== 'horizontal' && (
                    <button
                      className={`panel-resizer-btn${app.scrollSynced ? ' panel-resizer-btn--sync-active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); app.handleToggleScrollSync(); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title={app.scrollSynced ? 'Desync scroll' : 'Sync scroll'}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        {app.scrollSynced ? (
                          <>
                            <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1z"/>
                            <path d="M8 13h8v-2H8v2z"/>
                            <path d="M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                          </>
                        ) : (
                          <>
                            <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1z"/>
                            <path d="M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                          </>
                        )}
                      </svg>
                    </button>
                  )}
                  <button
                    className="panel-resizer-btn"
                    onClick={(e) => { e.stopPropagation(); app.setSplitPct(50); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="Reset to 50/50"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {app.hiddenPane !== 'right' && (
              <Suspense fallback={<div className="tl-loading" />}>
                <div className="pane-wrapper" style={{ flex: app.hiddenPane === 'left' ? '1' : 'var(--sheet-flex, 1)', minWidth: 0 }}>
                  <CombatSheet
                    slots={app.slots}
                    events={app.allProcessedEvents}
                    columns={app.columns}
                    enemy={app.enemy}
                    loadoutProperties={app.loadoutProperties}
                    loadouts={app.loadouts}
                    staggerBreaks={app.staggerBreaks}
                    zoom={app.zoom}
                    loadoutRowHeight={app.loadoutRowHeight}
                    headerRowHeight={app.headerRowHeight}
                    selectedFrames={app.selectedFrames}
                    hoverFrame={app.hoverFrame}
                    onScrollRef={app.handleDmgScrollRef}
                    onScroll={app.handleSheetScroll}
                    onZoom={app.handleZoom}
                    compact={!app.scrollSynced}
                    showRealTime={app.showRealTime}
                    contentFrames={app.contentFrames}
                    onDamageClick={app.handleDamageClick}
                    onDamageRows={app.setDamageRows}
                    critMode={app.critMode}
                    onCritModeChange={app.setCritMode}
                    plannerHidden={app.hiddenPane === 'left'}
                    resourceGraphs={app.resourceGraphs}
                  />
                  {(app.hidePreview === 'right' || app.showPreview === 'right') && (
                    <div className="pane-hide-overlay">
                      <svg className="pane-hide-icon" viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                        {app.hidePreview === 'right' ? (
                          <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                        ) : (
                          <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                        )}
                      </svg>
                    </div>
                  )}
                </div>
              </Suspense>
            )}
          </>
        )}
      </div>

      {app.contextMenu && (
        <ContextMenu
          x={app.contextMenu.x}
          y={app.contextMenu.y}
          items={app.contextMenu.items}
          onClose={() => app.setContextMenu(null)}
        />
      )}

      <Suspense fallback={null}>
        {app.editingEvent ? (
          <InformationPane
            mode="event"
            event={app.editingEvent}
            processedEvent={app.processedEditingEvent ?? undefined}
            operators={app.allOperators}
            slots={app.slots}
            enemy={app.enemy}
            columns={app.columns}
            onUpdate={app.handleUpdateEvent}
            onRemove={app.handleRemoveEvent}
            onClose={app.handleCloseInfoPane}
            selectedFrames={app.selectedFrames}
            readOnly={app.editingEventReadOnly}
            isDerived={app.editingEventIsDerived}
            editContext={app.editContext}
            triggerClose={app.infoPaneClosing}
            pinned={app.infoPanePinned}
            onTogglePin={() => app.setInfoPanePinned((p) => !p)}
            verbose={app.infoPaneVerbose}
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => ((v + 1) % 3) as 0 | 1 | 2)}
            interactionMode={app.interactionMode}
            rawEvents={app.events}
            allProcessedEvents={app.allProcessedEvents}
            loadoutProperties={app.loadoutProperties}
            damageRows={app.damageRows}
            spConsumptionHistory={app.spConsumptionHistory}
            onSaveAsCustomSkill={handleSaveAsCustomSkill}
          />
        ) : app.editingSlot && app.editingSlot.operator ? (
          <InformationPane
            mode="loadout"
            operatorId={app.editingSlot.operator.id}
            slotId={app.editingSlot.slotId}
            operator={app.editingSlot.operator}
            loadout={app.loadouts[app.editingSlot.slotId]}
            stats={app.loadoutProperties[app.editingSlot.slotId]}
            onStatsChange={(s) => app.handleStatsChange(app.editingSlot!.slotId, s)}
            onClose={app.handleCloseLoadoutPane}
            triggerClose={app.infoPaneClosing}
            pinned={app.infoPanePinned}
            onTogglePin={() => app.setInfoPanePinned((p) => !p)}
            verbose={app.infoPaneVerbose}
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => ((v + 1) % 3) as 0 | 1 | 2)}
            allProcessedEvents={app.allProcessedEvents}
            allOperators={app.allOperators}
            onSelectOperator={(opId) => app.handleSwapOperator(app.editingSlot!.slotId, opId)}
            onLoadoutChange={(lo) => app.handleLoadoutChange(app.editingSlot!.slotId, lo)}
          />
        ) : app.editingEnemyOpen ? (
          <InformationPane
            mode="enemy"
            enemy={app.enemy}
            enemyStats={app.enemyStats}
            onEnemyStatsChange={app.handleEnemyStatsChange}
            onClose={app.handleCloseEnemyPane}
            triggerClose={app.infoPaneClosing}
            pinned={app.infoPanePinned}
            onTogglePin={() => app.setInfoPanePinned((p) => !p)}
            verbose={app.infoPaneVerbose}
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => ((v + 1) % 3) as 0 | 1 | 2)}
          />
        ) : app.editingResourceCol && app.editingResourceConfig ? (
          <InformationPane
            mode="resource"
            label={app.editingResourceCol.label}
            color={app.editingResourceCol.color}
            config={app.editingResourceConfig}
            onChange={(cfg) => app.handleResourceConfigChange(app.editingResourceKey!, cfg)}
            onClose={app.handleCloseResourcePane}
            triggerClose={app.infoPaneClosing}
            pinned={app.infoPanePinned}
            onTogglePin={() => app.setInfoPanePinned((p) => !p)}
            verbose={app.infoPaneVerbose}
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => ((v + 1) % 3) as 0 | 1 | 2)}
            wasted={app.editingResourceKey ? app.resourceGraphs?.get(app.editingResourceKey)?.wasted : undefined}
          />
        ) : app.editingDamageRow ? (
          <InformationPane
            mode="damage"
            damageRow={app.editingDamageRow}
            onClose={app.handleCloseDamagePane}
            triggerClose={app.infoPaneClosing}
            pinned={app.infoPanePinned}
            onTogglePin={() => app.setInfoPanePinned((p) => !p)}
            verbose={app.infoPaneVerbose}
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => ((v + 1) % 3) as 0 | 1 | 2)}
          />
        ) : null}

        <DevlogModal open={app.devlogOpen} onClose={() => app.setDevlogOpen(false)} />
        {app.clauseEditorOpen && <ClauseEditorModal onClose={() => app.setClauseEditorOpen(false)} />}

        {app.keysOpen && <KeyboardShortcutsModal onClose={() => app.setKeysOpen(false)} />}

        <ExportModal
          open={app.exportModalOpen}
          tree={app.loadoutTree}
          activeLoadoutId={app.activeLoadoutId}
          onClose={() => app.setExportModalOpen(false)}
        />
      </Suspense>

      {app.warningMessage && <WarningModal message={app.warningMessage} onClose={() => app.setWarningMessage(null)} />}

      <ConfirmModal
        open={app.confirmClearLoadout}
        message="Clear current loadout? This will reset all operators, events, and loadouts."
        confirmLabel="Clear Loadout"
        onConfirm={app.handleClearLoadout}
        onClose={() => app.setConfirmClearLoadout(false)}
      />

      {app.saveFlash && (
        <div className="save-flash">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
            <path d="M17 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
          </svg>
        </div>
      )}

      <ConfirmModal
        open={app.confirmClearAll}
        message="Delete ALL loadouts and start fresh? This cannot be undone."
        confirmLabel="Clear All"
        onConfirm={app.handleClearAll}
        onClose={() => app.setConfirmClearAll(false)}
      />

      <ConfirmModal
        open={confirmClearCustom}
        message="Delete ALL custom content (operators, weapons, gear sets, skills)? The page will reload."
        confirmLabel="Clear Custom Content"
        onConfirm={() => {
          clearAllCustomContent();
          window.location.reload();
        }}
        onClose={() => setConfirmClearCustom(false)}
      />
    </div>
  );
}
