import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CockpitView, type LayoutOrientationMode } from './components/CockpitView';
import { GarageView } from './components/GarageView';
import { GuideView } from './components/GuideView';
import { PitSyncView } from './components/PitSyncView';
import { OfflineIndicator } from './components/PWAInstallButton';
import { RoomSetupScreen } from './components/RoomSetupScreen';
import { StatsView } from './components/StatsView';
import { TopBar, type ActiveTab } from './components/TopBar';
import { useDragRaceEngine } from './hooks/useDragRaceEngine';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import type { LaunchMode, RaceDistance, SensorMode } from './types/telemetry';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window === 'undefined') return 'cockpit';
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam === 'stats' || tabParam === 'garage' || tabParam === 'sync' || tabParam === 'guide') {
      return tabParam;
    }
    return 'cockpit';
  });

  const [showRoomSetup, setShowRoomSetup] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !new URLSearchParams(window.location.search).get('room');
  });

  const [targetDistance, setTargetDistance] = useState<RaceDistance>(201);
  const [launchMode, setLaunchMode] = useState<LaunchMode>('tree');
  const [sensorMode, setSensorMode] = useState<SensorMode>('live');
  const [layoutMode, setLayoutMode] = useState<LayoutOrientationMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    const saved = window.localStorage.getItem('sag_layout_mode');
    if (saved === 'landscape' || saved === 'portrait' || saved === 'auto') return saved;
    return 'auto';
  });

  const [detectedOrientation, setDetectedOrientation] = useState<'landscape' | 'portrait'>(() => {
    if (typeof window === 'undefined') return 'landscape';
    return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
  });

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'veh-default-01';
    return window.localStorage.getItem('sag_active_vehicle_id') || 'veh-default-01';
  });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const sync = useRealtimeSync('SAG-01', activeTab === 'sync' ? 'pit' : 'driver');

  const activeVehicle = useMemo(() => {
    return (
      sync.vehicles.find((v) => v.id === selectedVehicleId) ??
      sync.vehicles[0] ?? {
        id: 'veh-default-01',
        name: 'Unit Utama SAG',
        category: 'Motor 2-Tak',
        weightKg: 165,
        powerSpec: '155cc Tune Up',
        tireSpec: 'Drag Slick 60/80-17',
        notes: '',
        updatedAt: Date.now(),
      }
    );
  }, [sync.vehicles, selectedVehicleId]);

  const handleSelectVehicle = useCallback((id: string) => {
    setSelectedVehicleId(id);
    try {
      window.localStorage.setItem('sag_active_vehicle_id', id);
    } catch {
      // ignore
    }
  }, []);

  const handleChangeLayoutMode = useCallback(async (mode: LayoutOrientationMode) => {
    setLayoutMode(mode);
    try {
      window.localStorage.setItem('sag_layout_mode', mode);
    } catch {
      // ignore
    }
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (m: string) => Promise<void>;
      unlock?: () => void;
    };
    if (orientation) {
      try {
        if (mode === 'landscape' && typeof orientation.lock === 'function') {
          await orientation.lock('landscape');
        } else if (mode === 'portrait' && typeof orientation.lock === 'function') {
          await orientation.lock('portrait');
        } else if (mode === 'auto' && typeof orientation.unlock === 'function') {
          orientation.unlock();
        }
      } catch {
        // Orientation lock is optional and only active in fullscreen/PWA on supported devices
      }
    }
  }, []);

  useEffect(() => {
    const updateOrientation = () => {
      setDetectedOrientation(
        window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait'
      );
    };
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);
    const suppressInstallBanner = (e: Event) => {
      e.preventDefault();
    };
    window.addEventListener('beforeinstallprompt', suppressInstallBanner);
    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
      window.removeEventListener('beforeinstallprompt', suppressInstallBanner);
    };
  }, []);

  const effectiveLayout: 'landscape' | 'portrait' =
    layoutMode === 'auto' ? detectedOrientation : layoutMode;

  const engine = useDragRaceEngine({
    roomId: sync.roomId,
    activeVehicle,
    targetDistance,
    launchMode,
    sensorMode,
    onRunComplete: sync.saveRun,
    onLiveTelemetry: sync.publishLiveTelemetry,
  });

  const lastHandledRemoteCmdIdRef = useRef<string | null>(null);
  useEffect(() => {
    const cmd = sync.latestRemoteCommand;
    if (!cmd || cmd.id === lastHandledRemoteCmdIdRef.current) return;
    lastHandledRemoteCmdIdRef.current = cmd.id;

    if (activeTab !== 'cockpit') return;

    if (cmd.action === 'start_tree') {
      if (cmd.targetDistance === 201 || cmd.targetDistance === 402) {
        setTargetDistance(cmd.targetDistance);
      }
      setLaunchMode('tree');
      engine.startRace('tree');
    } else if (cmd.action === 'start_rollout') {
      if (cmd.targetDistance === 201 || cmd.targetDistance === 402) {
        setTargetDistance(cmd.targetDistance);
      }
      setLaunchMode('rollout');
      engine.startRace('rollout');
    } else if (cmd.action === 'trigger_launch') {
      engine.triggerManualLaunch();
    } else if (cmd.action === 'reset_race') {
      engine.resetRun();
    }
  }, [sync.latestRemoteCommand, activeTab, engine]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        if (layoutMode === 'landscape' || layoutMode === 'portrait') {
          const orientation = screen.orientation as ScreenOrientation & {
            lock?: (mode: string) => Promise<void>;
          };
          if (orientation && typeof orientation.lock === 'function') {
            try {
              await orientation.lock(layoutMode);
            } catch {
              // ignore
            }
          }
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen may be blocked in restricted iframes
    }
  }, [layoutMode]);

  const handleEnterRoom = useCallback(
    (chosenRoom: string, initialTab: ActiveTab) => {
      sync.changeRoom(chosenRoom);
      setActiveTab(initialTab);
      setShowRoomSetup(false);
    },
    [sync]
  );

  if (showRoomSetup) {
    return (
      <>
        <RoomSetupScreen initialRoomId={sync.roomId} onEnterRoom={handleEnterRoom} />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <div className="h-dvh w-screen flex flex-col overflow-hidden bg-[#07090E] text-slate-100">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        roomId={sync.roomId}
        onOpenRoomSetup={() => setShowRoomSetup(true)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => void toggleFullscreen()}
      />

      {activeTab === 'cockpit' && (
        <CockpitView
          targetDistance={targetDistance}
          onChangeDistance={setTargetDistance}
          launchMode={launchMode}
          onChangeLaunchMode={setLaunchMode}
          sensorMode={sensorMode}
          onChangeSensorMode={setSensorMode}
          layoutMode={layoutMode}
          effectiveLayout={effectiveLayout}
          onChangeLayoutMode={(m) => void handleChangeLayoutMode(m)}
          vehicles={sync.vehicles}
          activeVehicle={activeVehicle}
          onSelectVehicle={handleSelectVehicle}
          runs={sync.runs}
          roomId={sync.roomId}
          clientsCount={sync.clientsCount}
          connectionState={sync.connectionState}
          engine={engine}
          onOpenSyncTab={() => setActiveTab('sync')}
        />
      )}

      {activeTab === 'stats' && (
        <StatsView
          runs={sync.runs}
          vehicles={sync.vehicles}
          activeVehicleId={activeVehicle.id}
          roomId={sync.roomId}
          onDeleteRun={sync.deleteRun}
          onGoToCockpit={() => setActiveTab('cockpit')}
        />
      )}

      {activeTab === 'garage' && (
        <GarageView
          vehicles={sync.vehicles}
          activeVehicleId={activeVehicle.id}
          runs={sync.runs}
          onSelectVehicle={handleSelectVehicle}
          onUpsertVehicle={sync.upsertVehicle}
          onDeleteVehicle={sync.deleteVehicle}
        />
      )}

      {activeTab === 'sync' && (
        <PitSyncView
          roomId={sync.roomId}
          onChangeRoom={sync.changeRoom}
          clientsCount={sync.clientsCount}
          connectionState={sync.connectionState}
          transportMode={sync.transportMode}
          lastSyncTs={sync.lastSyncTs}
          liveTelemetry={sync.remoteLiveTelemetry}
          runs={sync.runs}
          onReconnect={sync.reconnectNow}
          onSendRaceCommand={sync.sendRaceCommand}
        />
      )}

      {activeTab === 'guide' && (
        <GuideView
          onBackToCockpit={() => setActiveTab('cockpit')}
          onGoToSync={() => setActiveTab('sync')}
          onGoToGarage={() => setActiveTab('garage')}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
