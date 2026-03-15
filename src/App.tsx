import { lazy, Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useApp } from './app/useApp';
import AppBar from './view/AppBar';
import LoadoutSidebar from './view/LoadoutSidebar';
import type { SidebarMode } from './view/LoadoutSidebar';
import { ContentCategory } from './consts/contentBrowserTypes';
import type { ContentSelection } from './consts/contentBrowserTypes';
import { weaponToCustomWeapon, gearSetToCustomGearSet, operatorToCustomOperator } from './controller/custom/builtinToCustomConverter';
import { ALL_OPERATORS } from './controller/operators/operatorRegistry';
import { COMBAT_SKILL_LABELS } from './consts/timelineColumnLabels';
import { createCustomWeapon } from './controller/custom/customWeaponController';
import { createCustomGearSet } from './controller/custom/customGearController';
import { createCustomOperator } from './controller/custom/customOperatorController';
import { createCustomSkill } from './controller/custom/customSkillController';
import { clearAllCustomContent } from './utils/customContentStorage';
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
          sidebarMode: parsed.sidebarMode === 'custom' ? 'custom' : 'loadouts',
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
  const [confirmClearCustom, setConfirmClearCustom] = useState(false);
  const draggedRef = useRef(false);

  // Persist UI selection state on change
  useEffect(() => {
    saveUiState({ sidebarMode, customPageActive });
  }, [sidebarMode, customPageActive]);

  const handleRestore = useCallback(() => {
    if (draggedRef.current) { draggedRef.current = false; return; }
    setExpandAnim(true);
    app.handleRestorePane();
    setTimeout(() => setExpandAnim(false), 350);
  }, [app.handleRestorePane]);

  const isCustomPage = customPageActive;

  return (
    <div className="app">
      <AppBar
        activeLoadoutName={app.loadoutTree.nodes.find((n) => n.id === app.activeLoadoutId)?.name ?? ''}
        onRenameLoadout={app.handleRenameActiveLoadout}
        onClearLoadout={() => isCustomPage ? setConfirmClearCustom(true) : app.setConfirmClearLoadout(true)}
        onClearAll={() => app.setConfirmClearAll(true)}
        onExport={app.handleExport}
        onImport={app.handleImport}
        onDevlog={() => app.setDevlogOpen(true)}
        onKeys={() => app.setKeysOpen((p) => !p)}
        onCustomContent={() => {
          setCustomPageActive(true);
          setSidebarMode('custom');
        }}
        debugMode={app.debugMode}
        onToggleDebug={() => app.setDebugMode((v) => !v)}
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
            } else if (mode === 'custom') {
              setCustomPageActive(true);
            }
          }}
          selectedContentItem={editingContent}
          onSelectContentItem={setEditingContent}
        />

        {isCustomPage ? (
          <Suspense fallback={<div className="tl-loading" style={{ flex: 1 }} />}>
            {pendingClone ? (
              pendingClone.category === ContentCategory.WEAPONS ? (
                <CustomWeaponWizard
                  initial={pendingClone.data}
                  onSave={(weapon) => {
                    const errors = createCustomWeapon(weapon);
                    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
                    setPendingClone(null);
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
                    return [];
                  }}
                  onCancel={() => setPendingClone(null)}
                />
              ) : null
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
                        resourceInteractions: skill.skillPointCost ? [{ resourceType: 'SKILL_POINT', verbType: 'EXPEND', value: skill.skillPointCost }] : undefined,
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
              <CustomContentPanel embedded />
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
                    onScrollRef={app.handleTlScrollRef}
                    onScroll={app.handleTimelineScroll}
                    onHoverFrame={app.setHoverFrame}
                    hideScrollbar={app.scrollSynced}
                    onDuplicateEvents={app.handleDuplicateEvents}
                    selectEventIds={app.selectEventIds}
                    onSelectEventIdsConsumed={() => app.setSelectEventIds(undefined)}
                    showRealTime={app.showRealTime}
                    onToggleRealTime={() => app.setShowRealTime((v) => !v)}
                    debugMode={app.debugMode}
                    staggerBreaks={app.staggerBreaks}
                    contentFrames={app.contentFrames}
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
                    loadoutStats={app.loadoutStats}
                    loadouts={app.loadouts}
                    staggerBreaks={app.staggerBreaks}
                    zoom={app.zoom}
                    loadoutRowHeight={app.loadoutRowHeight}
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
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => !v)}
            debugMode={app.debugMode}
            rawEvents={app.events}
            allProcessedEvents={app.allProcessedEvents}
            loadoutStats={app.loadoutStats}
            damageRows={app.damageRows}
            spConsumptionHistory={app.spConsumptionHistory}
          />
        ) : app.editingSlot && app.editingSlot.operator ? (
          <InformationPane
            mode="loadout"
            operatorId={app.editingSlot.operator.id}
            slotId={app.editingSlot.slotId}
            operator={app.editingSlot.operator}
            loadout={app.loadouts[app.editingSlot.slotId]}
            stats={app.loadoutStats[app.editingSlot.slotId]}
            onStatsChange={(s) => app.handleStatsChange(app.editingSlot!.slotId, s)}
            onClose={app.handleCloseLoadoutPane}
            triggerClose={app.infoPaneClosing}
            pinned={app.infoPanePinned}
            onTogglePin={() => app.setInfoPanePinned((p) => !p)}
            verbose={app.infoPaneVerbose}
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => !v)}
            allProcessedEvents={app.allProcessedEvents}
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
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => !v)}
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
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => !v)}
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
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => !v)}
          />
        ) : null}

        <DevlogModal open={app.devlogOpen} onClose={() => app.setDevlogOpen(false)} />

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
