import { lazy, Suspense } from 'react';
import { useApp } from './app/useApp';
import AppBar from './view/AppBar';
import LoadoutSidebar from './view/LoadoutSidebar';
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

export default function App() {
  const app = useApp();

  return (
    <div className="app">
      <AppBar
        activeLoadoutName={app.loadoutTree.nodes.find((n) => n.id === app.activeLoadoutId)?.name ?? ''}
        onRenameLoadout={app.handleRenameActiveLoadout}
        onClearLoadout={() => app.setConfirmClearLoadout(true)}
        onClearAll={() => app.setConfirmClearAll(true)}
        onExport={app.handleExport}
        onImport={app.handleImport}
        onDevlog={() => app.setDevlogOpen(true)}
        onKeys={() => app.setKeysOpen((p) => !p)}
        debugMode={app.debugMode}
        onToggleDebug={() => app.setDebugMode((v) => !v)}
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
          collapsed={app.sidebarCollapsed}
          onToggleCollapsed={app.handleToggleSidebar}
          onWarning={app.setWarningMessage}
        />

        <Suspense fallback={<div className="tl-loading" />}>
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
        </Suspense>

        <div
          className={`panel-resizer${app.scrollSynced ? ' panel-resizer--synced' : ''}`}
          onMouseDown={app.handleResizerMouseDown}
          title="Drag to resize"
        >
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
        </div>

        <Suspense fallback={<div className="tl-loading" />}>
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
        </Suspense>
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
    </div>
  );
}
