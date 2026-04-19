import { lazy, Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useApp } from './app/useApp';
import { useStatisticsApp } from './app/useStatisticsApp';
import AppBar from './view/AppBar';
import LoadoutSidebar from './view/LoadoutSidebar';
import StatisticsSidebar from './view/StatisticsSidebar';
import type { SidebarMode } from './view/LoadoutSidebar';
import { ContentCategory } from './consts/contentBrowserTypes';
import { operatorWarnings } from './controller/operators/operatorRegistry';
import { getAllSkillLabels } from './controller/gameDataStore';
import { createCustomWeapon, updateCustomWeapon } from './controller/custom/customWeaponController';
import { createCustomGearSet, updateCustomGearSet } from './controller/custom/customGearController';
import { createCustomOperator, updateCustomOperator } from './controller/custom/customOperatorController';
import { createCustomSkill, updateCustomSkill } from './controller/custom/customSkillController';
import { createCustomWeaponEffect, updateCustomWeaponEffect } from './controller/custom/customWeaponEffectController';
import { createCustomGearEffect, updateCustomGearEffect } from './controller/custom/customGearEffectController';
import { createCustomOperatorStatus, updateCustomOperatorStatus } from './controller/custom/customOperatorStatusController';
import { createCustomOperatorTalent, updateCustomOperatorTalent } from './controller/custom/customOperatorTalentController';
import { addSkillLink } from './controller/custom/customSkillLinkController';
import { t } from './locales/locale';
import { InteractionModeType, InfoLevel, InfoPaneMode, SidebarMode as SidebarModeEnum } from './consts/enums';
import { getAnimationDuration, eventDuration } from './consts/viewTypes';
import type { SkillType } from './consts/viewTypes';
import type { CustomWeapon } from './model/custom/customWeaponTypes';
import type { CustomGearSet } from './model/custom/customGearTypes';
import type { CustomOperator } from './model/custom/customOperatorTypes';
import type { CustomSkill } from './model/custom/customSkillTypes';
import type { CustomWeaponEffect } from './model/custom/customWeaponEffectTypes';
import type { CustomGearEffect } from './model/custom/customGearEffectTypes';
import type { CustomOperatorStatus } from './model/custom/customOperatorStatusTypes';
import type { CustomOperatorTalent } from './model/custom/customOperatorTalentTypes';
import ContextMenu from './view/ContextMenu';
import WarningModal from './view/WarningModal';
import ConfirmModal from './view/ConfirmModal';
import CreateViewsModal from './view/CreateViewsModal';
import CollaborationHostDialog from './view/CollaborationHostDialog';
import CollaborationJoinDialog from './view/CollaborationJoinDialog';
import { LoadoutNodeType } from './consts/enums';
import './App.css';

type CustomContentData = CustomWeapon | CustomGearSet | CustomOperator | CustomSkill
  | CustomWeaponEffect | CustomGearEffect | CustomOperatorStatus | CustomOperatorTalent;

const CombatPlanner = lazy(() => import('./view/CombatPlanner'));
const CombatSheet = lazy(() => import('./view/CombatSheet'));
const InformationPane = lazy(() => import('./view/InformationPane'));
const DevlogModal = lazy(() => import('./view/DevlogModal'));
const SettingsModal = lazy(() => import('./view/SettingsModal'));
const ExportModal = lazy(() => import('./view/ExportModal'));
const KeyboardShortcutsModal = lazy(() => import('./view/KeyboardShortcutsModal'));
const UnifiedCustomizer = lazy(() => import('./view/custom/UnifiedCustomizer'));
const StatisticsView = lazy(() => import('./view/StatisticsView'));

const UI_STATE_KEY = 'zst-ui-state';

interface UiState {
  activeView: SidebarModeEnum;
  sidebarOpen: boolean;
}

function loadUiState(): UiState {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const mode = parsed.activeView ?? parsed.sidebarMode;
        const activeView =
          mode === SidebarModeEnum.WORKBENCH ? SidebarModeEnum.WORKBENCH
          : mode === SidebarModeEnum.STATISTICS ? SidebarModeEnum.STATISTICS
          : SidebarModeEnum.LOADOUTS;
        const sidebarOpen = parsed.sidebarOpen !== false;
        return { activeView, sidebarOpen };
      }
    }
  } catch { /* ignore */ }
  return { activeView: SidebarModeEnum.LOADOUTS, sidebarOpen: true };
}

function saveUiState(state: UiState): void {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export default function App() {
  const app = useApp();
  const stats = useStatisticsApp(app.loadoutTree, app.activeLoadoutId, app.buildSheetData);
  const [expandAnim, setExpandAnim] = useState(false);
  const [activeView, setActiveView] = useState<SidebarModeEnum>(() => loadUiState().activeView);
  const [sidebarOpen, setSidebarOpen] = useState(() => loadUiState().sidebarOpen);
  const sidebarMode: SidebarMode = sidebarOpen ? activeView : null;
  const [workbenchOpen, setWorkbenchOpen] = useState(() => loadUiState().activeView === SidebarModeEnum.WORKBENCH);
  const [viewsModal, setViewsModal] = useState<{ parentId: string } | null>(null);
  const [workbenchInitial, setWorkbenchInitial] = useState<{ entityType: ContentCategory; data: CustomContentData } | undefined>();
  const [contentRefreshKey, setContentRefreshKey] = useState(0);
  const bumpContentRefresh = useCallback(() => setContentRefreshKey((k) => k + 1), []);
  const draggedRef = useRef(false);
  const [hostDialogOpen, setHostDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

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

  // Suppress browser context menu globally
  useEffect(() => {
    const suppress = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', suppress, { capture: true });
    return () => document.removeEventListener('contextmenu', suppress, { capture: true });
  }, []);

  // Persist UI selection state on change
  useEffect(() => {
    saveUiState({ activeView, sidebarOpen });
  }, [activeView, sidebarOpen]);

  const handleRestore = useCallback(() => {
    if (draggedRef.current) { draggedRef.current = false; return; }
    setExpandAnim(true);
    app.handleRestorePane();
    setTimeout(() => setExpandAnim(false), 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.handleRestorePane]);


  const handleWorkbenchSave = useCallback((type: ContentCategory, data: CustomContentData): string[] => {
    let errors: import('./utils/customContentStorage').ValidationError[] = [];
    const isEdit = workbenchInitial?.entityType === type && workbenchInitial?.data?.id === data.id;
    if (type === ContentCategory.OPERATORS) {
      const d = data as CustomOperator;
      errors = isEdit ? updateCustomOperator(d.id, d) : createCustomOperator(d);
    } else if (type === ContentCategory.WEAPONS) {
      const d = data as CustomWeapon;
      errors = isEdit ? updateCustomWeapon(d.id, d) : createCustomWeapon(d);
    } else if (type === ContentCategory.GEAR_SETS) {
      const d = data as CustomGearSet;
      errors = isEdit ? updateCustomGearSet(d.id, d) : createCustomGearSet(d);
    } else if (type === ContentCategory.SKILLS) {
      const d = data as CustomSkill;
      errors = isEdit ? updateCustomSkill(d.id, d) : createCustomSkill(d);
    } else if (type === ContentCategory.WEAPON_EFFECTS) {
      const d = data as CustomWeaponEffect;
      errors = isEdit ? updateCustomWeaponEffect(d.id, d) : createCustomWeaponEffect(d);
    } else if (type === ContentCategory.GEAR_EFFECTS) {
      const d = data as CustomGearEffect;
      errors = isEdit ? updateCustomGearEffect(d.id, d) : createCustomGearEffect(d);
    } else if (type === ContentCategory.OPERATOR_STATUSES) {
      const d = data as CustomOperatorStatus;
      errors = isEdit ? updateCustomOperatorStatus(d.id, d) : createCustomOperatorStatus(d);
    } else if (type === ContentCategory.OPERATOR_TALENTS) {
      const d = data as CustomOperatorTalent;
      errors = isEdit ? updateCustomOperatorTalent(d.id, d) : createCustomOperatorTalent(d);
    }
    if (errors.length > 0) return errors.map((e) => `${e.field}: ${e.message}`);
    // Only close workbench if it was opened with an initial item (from external trigger)
    if (workbenchInitial) {
      setWorkbenchOpen(false);
      setWorkbenchInitial(undefined);
    }
    bumpContentRefresh();
    return [];
  }, [workbenchInitial, bumpContentRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const COLUMN_TO_SKILL_TYPE: Record<string, string> = {
    basic: 'BASIC_ATTACK', battle: 'BATTLE', combo: 'COMBO', ultimate: 'ULTIMATE',
  };

  const handleSaveAsCustomSkill = useCallback((event: import('./consts/viewTypes').TimelineEvent) => {
    const skillType = COLUMN_TO_SKILL_TYPE[event.columnId];
    if (!skillType) return;

    const id = `skill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const label = getAllSkillLabels()[event.name as string] || event.name;
    const skill: CustomSkill = {
      id,
      name: `${label} (Custom)`,
      combatSkillType: skillType as string,
      durationSeconds: eventDuration(event) / 120,
      cooldownSeconds: undefined,
      animationSeconds: getAnimationDuration(event) / 120 || undefined,
    };

    const errors = createCustomSkill(skill);
    if (errors.length > 0) return;

    addSkillLink(event.ownerEntityId, event.columnId as SkillType, id);
    bumpContentRefresh();
    app.bumpCustomSkillVersion();
  }, [bumpContentRefresh, app.bumpCustomSkillVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      <AppBar
        onDevlog={() => app.setDevlogOpen(true)}
        onKeys={() => app.setKeysOpen((p) => !p)}
        interactionMode={app.interactionMode}
        onToggleInteractionMode={() => app.setInteractionMode(m => m === InteractionModeType.STRICT ? InteractionModeType.FREEFORM : InteractionModeType.STRICT)}
        lightMode={app.lightMode}
        onToggleTheme={app.handleToggleTheme}
        onSettings={() => app.setSettingsOpen(true)}
        collaborationStatus={app.collaboration.session?.connectionStatus ?? null}
        collaborationPeerCount={app.collaboration.session?.peers.length ?? 0}
        collaborationRoomId={app.collaboration.session?.roomId ?? null}
        collaborationPeers={app.collaboration.session?.peers.map((p) => ({
          peerId: p.peerId,
          displayName: p.displayName,
          role: p.role,
          isLocal: p.peerId === app.collaboration.session?.localPeerId,
        })) ?? []}
        collaborationReconnect={app.collaboration.session?.reconnect}
        onHostCollaboration={() => setHostDialogOpen(true)}
        onJoinCollaboration={() => setJoinDialogOpen(true)}
        onLeaveCollaboration={() => app.collaboration.leaveRoom()}
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
          onDownloadLoadout={app.handleDownloadLoadout}
          onShareLoadout={app.handleShareLoadout}
          onWarning={app.setWarningMessage}
          onLoadCommunityLoadout={app.handleLoadCommunityLoadout}
          onExport={app.handleExport}
          onImport={app.handleImport}
          onOpenViewsModal={(parentId) => setViewsModal({ parentId })}
          onClearViews={app.handleClearLoadoutViews}
          viewWarningMap={app.viewWarningMap}
          syncingLoadoutUuids={app.collaboration.syncingLoadoutUuids}
          sidebarMode={sidebarMode}
          onSidebarModeChange={(mode) => {
            if (mode === null) {
              // Collapse rail; keep main view intact.
              setSidebarOpen(false);
              return;
            }
            setActiveView(mode);
            setSidebarOpen(true);
            if (mode === SidebarModeEnum.WORKBENCH) {
              setWorkbenchOpen(true);
              if (!workbenchInitial) setWorkbenchInitial(undefined);
            } else {
              setWorkbenchOpen(false);
            }
          }}
        />

        {activeView === SidebarModeEnum.STATISTICS && sidebarOpen && (
          <StatisticsSidebar
            tree={stats.statisticsTree}
            activeId={stats.activeStatisticsId}
            onTreeChange={stats.handleTreeChange}
            onSelect={stats.handleSelectStatistics}
            onNew={stats.handleNewStatistics}
            onDelete={stats.handleDeleteStatistics}
            onWarning={app.setWarningMessage}
          />
        )}

        {activeView === SidebarModeEnum.STATISTICS ? (
          <Suspense fallback={<div className="tl-loading" style={{ flex: 1 }} />}>
            <StatisticsView
              data={stats.activeStatisticsData}
              statisticsName={stats.activeStatisticsNode?.name ?? null}
              loadoutTree={app.loadoutTree}
              activeLoadoutId={app.activeLoadoutId}
              resolvedSources={stats.resolvedSources}
              sourceBundles={stats.sourceBundles}
              onAddSource={stats.handleAddSource}
              onRemoveSource={stats.handleRemoveSource}
              onNewStatistics={stats.handleNewStatistics}
              onToggleColumn={stats.handleToggleColumn}
              onToggleOperator={stats.handleToggleOperator}
              onSetCritMode={stats.handleSetCritMode}
              onSetComparisonMode={stats.handleSetComparisonMode}
              onReorderSources={stats.handleReorderSources}
            />
          </Suspense>
        ) : workbenchOpen && activeView === SidebarModeEnum.WORKBENCH ? (
          <Suspense fallback={<div className="tl-loading" style={{ flex: 1 }} />}>
            <UnifiedCustomizer
              initial={workbenchInitial}
              onSave={handleWorkbenchSave}
              onCancel={() => {
                setWorkbenchOpen(false);
                setActiveView(SidebarModeEnum.LOADOUTS);
                setSidebarOpen(true);
              }}
              onContentChanged={bumpContentRefresh}
              contentRefreshKey={contentRefreshKey}
            />
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
                    editingSlotId={app.editingSlot?.slotId}
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
                    onSetCritPins={app.handleSetCritPins}
                    onSetChancePins={app.handleSetChancePins}
                    onRemoveSegment={app.handleRemoveSegment}
                    onAddSegment={app.handleAddSegment}
                    onAddFrame={app.handleAddFrame}
                    onMoveFrame={app.handleMoveFrame}
                    onResizeSegment={app.handleResizeSegment}
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
                    onSelectEventIdsConsumed={app.handleSelectEventIdsConsumed}
                    showRealTime={app.showRealTime}
                    onToggleRealTime={app.handleToggleRealTime}
                    interactionMode={app.interactionMode}
                    staggerBreaks={app.staggerBreaks}
                    contentFrames={app.contentFrames}
                    spInsufficiencyZones={app.spInsufficiencyZones}
                    dragThrottle={app.dragThrottle}
                    readOnly={app.readOnly}
                    editingEventId={app.editingEventId}

                    infoPaneOpen={!!(app.editingEventId || app.editingSlot || app.editingEnemyOpen || app.editingResourceKey || app.editingDamageRow)}
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
                    hoverFrameRef={app.hoverFrameRef}
                    onHoverFrame={app.setHoverFrame}
                    onScrollRef={app.handleDmgScrollRef}
                    onScroll={app.handleSheetScroll}
                    onZoom={app.handleZoom}
                    compact={!app.scrollSynced}
                    showRealTime={app.showRealTime}
                    contentFrames={app.contentFrames}
                    onDamageClick={app.handleDamageClick}
                    onDamageRows={app.setDamageRows}
                    onSelectFrame={app.handleSelectFrame}
                    critMode={app.critMode}
                    onCritModeChange={app.setCritMode}
                    onRandomizeCrit={app.handleRandomizeCrit}
                    overrides={app.overrides}
                    plannerHidden={app.hiddenPane === 'left'}
                    resourceGraphs={app.resourceGraphs}
                    onEditLoadout={app.readOnly ? undefined : app.handleEditLoadout}
                    editingSlotId={app.editingSlot?.slotId}
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
            mode={InfoPaneMode.EVENT}
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
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => { const max = app.settings.debugMode ? InfoLevel.DEBUG : InfoLevel.VERBOSE; return (v >= max ? InfoLevel.CONCISE : v + 1) as InfoLevel; })}
            debugMode={app.settings.debugMode}
            rawEvents={app.events}
            allProcessedEvents={app.allProcessedEvents}
            loadoutProperties={app.loadoutProperties}
            damageRows={app.damageRows}
            spConsumptionHistory={app.spConsumptionHistory}
            onSaveAsCustomSkill={handleSaveAsCustomSkill}
            overrides={app.overrides}
            onSetJsonOverride={app.handleSetJsonOverride}
            onClearJsonOverride={app.handleClearJsonOverride}
          />
        ) : app.editingSlot && app.editingSlot.operator ? (
          <InformationPane
            mode={InfoPaneMode.LOADOUT}
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
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => { const max = app.settings.debugMode ? InfoLevel.DEBUG : InfoLevel.VERBOSE; return (v >= max ? InfoLevel.CONCISE : v + 1) as InfoLevel; })}
            allProcessedEvents={app.allProcessedEvents}
            allOperators={app.allOperators}
            onSelectOperator={(opId) => app.handleSwapOperator(app.editingSlot!.slotId, opId)}
            onLoadoutChange={(lo) => app.handleLoadoutChange(app.editingSlot!.slotId, lo)}
          />
        ) : app.editingEnemyOpen ? (
          <InformationPane
            mode={InfoPaneMode.ENEMY}
            enemy={app.enemy}
            enemyStats={app.enemyStats}
            onEnemyStatsChange={app.handleEnemyStatsChange}
            onClose={app.handleCloseEnemyPane}
            triggerClose={app.infoPaneClosing}
            pinned={app.infoPanePinned}
            onTogglePin={() => app.setInfoPanePinned((p) => !p)}
            verbose={app.infoPaneVerbose}
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => { const max = app.settings.debugMode ? InfoLevel.DEBUG : InfoLevel.VERBOSE; return (v >= max ? InfoLevel.CONCISE : v + 1) as InfoLevel; })}
          />
        ) : app.editingResourceCol && app.editingResourceConfig ? (
          <InformationPane
            mode={InfoPaneMode.RESOURCE}
            label={app.editingResourceCol.label}
            color={app.editingResourceCol.color}
            config={app.editingResourceConfig}
            onChange={(cfg) => app.handleResourceConfigChange(app.editingResourceKey!, cfg)}
            onClose={app.handleCloseResourcePane}
            triggerClose={app.infoPaneClosing}
            pinned={app.infoPanePinned}
            onTogglePin={() => app.setInfoPanePinned((p) => !p)}
            verbose={app.infoPaneVerbose}
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => { const max = app.settings.debugMode ? InfoLevel.DEBUG : InfoLevel.VERBOSE; return (v >= max ? InfoLevel.CONCISE : v + 1) as InfoLevel; })}
            wasted={app.editingResourceKey ? app.resourceGraphs?.get(app.editingResourceKey)?.wasted : undefined}
          />
        ) : app.editingDamageRow ? (
          <InformationPane
            mode="damage"
            damageRow={app.editingDamageRow}
            frame={app.allProcessedEvents.find((e) => e.uid === app.editingDamageRow!.eventUid)?.segments?.[app.editingDamageRow!.segmentIndex]?.frames?.[app.editingDamageRow!.frameIndex]}
            onToggleCrit={(uid, si, fi, value) => {
              const ev = app.events.find((e) => e.uid === uid);
              if (!ev) return;
              const segs = [...(ev.segments ?? [])];
              const seg = { ...segs[si], frames: [...(segs[si].frames ?? [])] };
              seg.frames[fi] = { ...seg.frames[fi], isCrit: value };
              segs[si] = seg;
              app.handleUpdateEvent(uid, { segments: segs });
            }}
            onClose={app.handleCloseDamagePane}
            triggerClose={app.infoPaneClosing}
            pinned={app.infoPanePinned}
            onTogglePin={() => app.setInfoPanePinned((p) => !p)}
            verbose={app.infoPaneVerbose}
            onToggleVerbose={() => app.setInfoPaneVerbose((v) => { const max = app.settings.debugMode ? InfoLevel.DEBUG : InfoLevel.VERBOSE; return (v >= max ? InfoLevel.CONCISE : v + 1) as InfoLevel; })}
          />
        ) : null}

        <DevlogModal open={app.devlogOpen} onClose={() => app.setDevlogOpen(false)} />
        <SettingsModal
          open={app.settingsOpen}
          onClose={() => app.setSettingsOpen(false)}
          settings={app.settings}
          onUpdate={app.handleUpdateSetting}
        />
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

      {app.urlCopiedFlash && (
        <div className="save-flash url-copied-flash">
          <svg viewBox="0 0 16 16" width="40" height="40" fill="currentColor">
            <path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/>
            <path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243L6.586 4.672z"/>
          </svg>
          <span className="url-copied-flash-label">{t('sidebar.btn.shareCopied')}</span>
        </div>
      )}

      <ConfirmModal
        open={app.confirmClearAll}
        message="Delete ALL loadouts and start fresh? This cannot be undone."
        confirmLabel="Clear All"
        onConfirm={app.handleClearAll}
        onClose={() => app.setConfirmClearAll(false)}
      />

      {viewsModal && (() => {
        const sourceLoadoutId = (() => {
          const node = app.loadoutTree.nodes.find((n) => n.id === viewsModal.parentId);
          if (!node) return null;
          if (node.type === LoadoutNodeType.LOADOUT) return node.id;
          if (node.type === LoadoutNodeType.LOADOUT_VIEW && node.viewParentId) return node.viewParentId;
          return null;
        })();
        if (!sourceLoadoutId) return null;
        const sourceNode = app.loadoutTree.nodes.find((n) => n.id === sourceLoadoutId);
        const slotContexts = app.getViewSlotContexts(sourceLoadoutId) ?? [];
        const hasExisting = app.loadoutTree.nodes.some(
          (n) => n.parentId === sourceLoadoutId && n.type === LoadoutNodeType.LOADOUT_VIEW,
        );
        return (
          <CreateViewsModal
            open
            slots={slotContexts}
            initialSelections={sourceNode?.viewSelections}
            hasExistingViews={hasExisting}
            onConfirm={(selections) => {
              app.handleCreateLoadoutViews(sourceLoadoutId, selections);
              setViewsModal(null);
            }}
            onClose={() => setViewsModal(null)}
          />
        );
      })()}

      <CollaborationHostDialog
        open={hostDialogOpen}
        tree={app.loadoutTree}
        defaultDisplayName={app.collaboration.session?.localDisplayName ?? 'Player'}
        onHost={(displayName, uuids, maxPeers) => {
          app.collaboration.hostRoom(displayName, uuids, maxPeers);
          for (const uuid of uuids) app.collaboration.shareLoadout(uuid);
        }}
        onClose={() => setHostDialogOpen(false)}
      />

      <CollaborationJoinDialog
        open={joinDialogOpen}
        defaultDisplayName="Player"
        onJoin={(roomId, displayName) => {
          app.collaboration.joinRoom(roomId, displayName);
          setJoinDialogOpen(false);
        }}
        onClose={() => setJoinDialogOpen(false)}
      />

    </div>
  );
}
