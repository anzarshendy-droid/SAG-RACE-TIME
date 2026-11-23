import { useEffect, useMemo, useState } from 'react';
import {
  Crosshair,
  FileText,
  Monitor,
  Play,
  RotateCcw,
  Satellite,
  Smartphone,
  Zap,
} from 'lucide-react';
import type { SyncConnectionState } from '../hooks/useRealtimeSync';
import type { useDragRaceEngine } from '../hooks/useDragRaceEngine';
import { exportRunsPdf } from '../lib/exportPdf';
import { computeVehicleStats, formatSec, formatSpeed, getSplitValue } from '../lib/stats';
import type {
  DragRunRecord,
  LaunchMode,
  RaceDistance,
  SensorMode,
  SplitDistance,
  VehicleProfile,
} from '../types/telemetry';
import { ChristmasTree, StartTreeOverlay } from './ChristmasTree';
import { TelemetryChart } from './TelemetryChart';

export type LayoutOrientationMode = 'auto' | 'landscape' | 'portrait';

interface CockpitViewProps {
  targetDistance: RaceDistance;
  onChangeDistance: (d: RaceDistance) => void;
  launchMode: LaunchMode;
  onChangeLaunchMode: (m: LaunchMode) => void;
  sensorMode: SensorMode;
  onChangeSensorMode: (m: SensorMode) => void;
  layoutMode: LayoutOrientationMode;
  effectiveLayout: 'landscape' | 'portrait';
  onChangeLayoutMode: (m: LayoutOrientationMode) => void;
  vehicles: VehicleProfile[];
  activeVehicle: VehicleProfile;
  onSelectVehicle: (id: string) => void;
  runs: DragRunRecord[];
  roomId: string;
  clientsCount: number;
  connectionState: SyncConnectionState;
  engine: ReturnType<typeof useDragRaceEngine>;
  onOpenSyncTab: () => void;
}

const SPLIT_ROWS: SplitDistance[] = [20, 100, 201, 402];

export function CockpitView({
  targetDistance,
  onChangeDistance,
  launchMode,
  onChangeLaunchMode,
  sensorMode,
  onChangeSensorMode,
  layoutMode,
  effectiveLayout,
  onChangeLayoutMode,
  vehicles,
  activeVehicle,
  onSelectVehicle,
  runs,
  roomId,
  clientsCount,
  connectionState,
  engine,
  onOpenSyncTab,
}: CockpitViewProps) {
  const stats = useMemo(
    () => computeVehicleStats(runs, activeVehicle.id),
    [runs, activeVehicle.id]
  );

  const pbRun = useMemo(() => {
    const valid = runs.filter(
      (r) => r.vehicleId === activeVehicle.id && r.targetDistance === targetDistance && !r.isRedLight
    );
    if (valid.length === 0) return null;
    return valid.reduce((best, cur) => (cur.etSec < best.etSec ? cur : best), valid[0]);
  }, [runs, activeVehicle.id, targetDistance]);

  const isBusy =
    engine.runState === 'staging' ||
    engine.runState === 'countdown' ||
    engine.runState === 'armed' ||
    engine.runState === 'running';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && sensorMode === 'simulation') {
        if (engine.runState === 'countdown' || engine.runState === 'armed') {
          e.preventDefault();
          engine.triggerManualLaunch();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sensorMode, engine]);

  const speedPct = Math.min(100, Math.max(0, (engine.liveSpeedKmh / 200) * 100));
  const gNorm = Math.max(-0.5, Math.min(1.5, engine.liveAccelG));
  const gBarLeftPct = gNorm >= 0 ? 25 : 25 + (gNorm / 0.5) * 25;
  const gBarWidthPct = gNorm >= 0 ? (gNorm / 1.5) * 75 : Math.abs(gNorm / 0.5) * 25;

  const finalSplit = engine.splits.find((s) => s.distance === targetDistance);
  const displayEt =
    engine.runState === 'redlight'
      ? 0
      : finalSplit
        ? finalSplit.timeSec
        : engine.elapsedSec;

  const etDeltaVsPb =
    engine.runState === 'finished' && pbRun && finalSplit
      ? finalSplit.timeSec - pbRun.etSec
      : null;

  const isPortrait = effectiveLayout === 'portrait';

  const cycleSensitivity = () => {
    const next =
      engine.sensitivity === 'low'
        ? 'medium'
        : engine.sensitivity === 'medium'
          ? 'high'
          : 'low';
    engine.setSensitivity(next);
  };

  const sensitivityLabel =
    engine.sensitivity === 'low'
      ? 'Anti-Getar'
      : engine.sensitivity === 'medium'
        ? 'Normal'
        : 'Sensitif';

  const [showGoFlash, setShowGoFlash] = useState(false);

  useEffect(() => {
    if (launchMode === 'tree' && engine.runState === 'running') {
      setShowGoFlash(true);
      const t = setTimeout(() => setShowGoFlash(false), 450);
      return () => clearTimeout(t);
    }
    setShowGoFlash(false);
  }, [launchMode, engine.runState]);

  const showStartOverlay =
    launchMode === 'tree' &&
    (engine.runState === 'staging' ||
      engine.runState === 'countdown' ||
      engine.runState === 'armed' ||
      engine.runState === 'redlight' ||
      (engine.runState === 'running' && showGoFlash));

  const renderActionButtons = () => (
    <div className="shrink-0 flex flex-col gap-1.5">
      {sensorMode === 'live' && engine.sensor.imuStatus === 'needs_permission' && (
        <button
          type="button"
          onClick={() => void engine.requestImuAccess()}
          className="w-full py-1.5 px-3 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-md cursor-pointer"
        >
          Izinkan Sensor Akselerometer
        </button>
      )}

      <div className="flex items-center gap-2">
        {sensorMode === 'simulation' &&
        (engine.runState === 'countdown' || engine.runState === 'armed') ? (
          <button
            type="button"
            onClick={engine.triggerManualLaunch}
            className="flex-1 min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-display font-bold text-lg tracking-wide uppercase rounded-md transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            <span>GAS / LAUNCH! (Spasi)</span>
          </button>
        ) : !isBusy ? (
          <button
            type="button"
            onClick={() => engine.startRace()}
            className="flex-1 min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-500 active:scale-[0.99] text-white font-display font-bold text-lg tracking-wide uppercase rounded-md transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>
              {engine.runState === 'finished' || engine.runState === 'redlight'
                ? 'RACE LAGI'
                : 'MULAI RACE'}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={engine.resetRun}
            className="flex-1 min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-display font-bold text-base tracking-wide uppercase rounded-md transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>BATALKAN / RESET</span>
          </button>
        )}

        {engine.runState !== 'idle' && !isBusy && (
          <button
            type="button"
            onClick={engine.resetRun}
            aria-label="Reset Layar"
            className="min-h-[44px] min-w-[44px] px-3 bg-[#07090E] hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-md flex items-center justify-center cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  const renderSplitsRows = (compactRow = false) => (
    <div className="flex-1 min-h-0 flex flex-col justify-center">
      <div className="grid grid-cols-4 text-[10px] font-medium text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-800/60">
        <span>Jarak</span>
        <span className="text-right">Waktu</span>
        <span className="text-right">Speed</span>
        <span className="text-right">Best</span>
      </div>
      <div className="divide-y divide-slate-800/50">
        {SPLIT_ROWS.map((dist) => {
          const disabledIn201 = targetDistance === 201 && dist === 402;
          const sp = engine.splits.find((s) => s.distance === dist);
          const pbSplitVal =
            dist === 20
              ? stats.best20m
              : dist === 100
                ? stats.best100m
                : dist === 201
                  ? stats.best201m
                  : stats.best402m;
          const isTarget = dist === targetDistance;
          return (
            <div
              key={dist}
              className={`grid grid-cols-4 items-center ${
                compactRow ? 'py-1' : 'py-1 sm:py-1.5'
              } text-xs font-mono tabular-nums ${
                disabledIn201
                  ? 'opacity-30'
                  : isTarget
                    ? 'text-white font-semibold'
                    : 'text-slate-200'
              }`}
            >
              <span className={isTarget ? 'text-red-400' : 'text-slate-400'}>{dist}m</span>
              <span className="text-right">{sp ? `${sp.timeSec.toFixed(3)}s` : '--.---'}</span>
              <span className="text-right text-cyan-400">
                {sp ? `${sp.speedKmh.toFixed(1)}` : '--.-'}
              </span>
              <span className="text-right text-slate-400">
                {pbSplitVal !== null ? `${pbSplitVal.toFixed(3)}` : '--.---'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSensorStatusLine = () => (
    <div className="w-full flex items-center justify-between gap-2 text-[11px] text-slate-400 font-mono shrink-0">
      <span className="flex items-center gap-1.5 min-w-0 truncate">
        {sensorMode === 'live' ? (
          <>
            <Satellite className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate">
              GPS{' '}
              {engine.sensor.gpsStatus === 'locked'
                ? `±${engine.sensor.gpsAccuracyM ?? '-'}m`
                : engine.sensor.gpsStatus === 'denied'
                  ? 'Ditolak'
                  : engine.sensor.gpsStatus === 'searching'
                    ? 'Cari...'
                    : 'Lemah'}
            </span>
            <span aria-hidden="true">·</span>
            <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{engine.sensor.sampleRateHz || 0}Hz</span>
          </>
        ) : (
          <>
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Simulasi · {activeVehicle.category}</span>
          </>
        )}
      </span>
      <span className="text-slate-300 tabular-nums shrink-0">
        {engine.distanceM.toFixed(1)}/{targetDistance}m
      </span>
    </div>
  );

  return (
    <div className="relative flex-1 min-h-0 flex flex-col bg-[#07090E] overflow-hidden">
      {/* Unified Neat Instrument Toolbar */}
      <div
        className={`shrink-0 mx-2 mt-1.5 bg-[#0F131C] border border-slate-800/90 rounded-lg px-2 py-1 flex items-center justify-between gap-1.5 ${
          isPortrait ? 'flex-wrap' : 'flex-nowrap'
        }`}
      >
        {/* Left: Core Race Settings */}
        <div className={`flex items-center gap-1.5 ${isPortrait ? 'flex-wrap' : 'flex-nowrap shrink-0'}`}>
          {/* Distance Selector */}
          <div className="flex items-center h-7 bg-[#07090E] border border-slate-800 rounded-md p-0.5 shrink-0">
            {([201, 402] as RaceDistance[]).map((d) => (
              <button
                key={d}
                type="button"
                disabled={isBusy}
                onClick={() => onChangeDistance(d)}
                className={`h-full px-2 text-xs font-mono font-bold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                  targetDistance === d
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {d}m
              </button>
            ))}
          </div>

          {/* Launch Mode Selector */}
          <div className="flex items-center h-7 bg-[#07090E] border border-slate-800 rounded-md p-0.5 shrink-0">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onChangeLaunchMode('tree')}
              className={`h-full px-2 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                launchMode === 'tree'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="lg:hidden">Tree</span>
              <span className="hidden lg:inline">Tree+RT</span>
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onChangeLaunchMode('rollout')}
              className={`h-full px-2 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                launchMode === 'rollout'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Rollout
            </button>
          </div>

          {/* Sensor Mode Selector */}
          <div className="flex items-center h-7 bg-[#07090E] border border-slate-800 rounded-md p-0.5 shrink-0">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onChangeSensorMode('live')}
              className={`h-full px-2 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                sensorMode === 'live'
                  ? 'bg-cyan-600/90 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="lg:hidden">GPS</span>
              <span className="hidden lg:inline">GPS+IMU</span>
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onChangeSensorMode('simulation')}
              className={`h-full px-2 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                sensorMode === 'simulation'
                  ? 'bg-amber-600/90 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="lg:hidden">Sim</span>
              <span className="hidden lg:inline">Simulasi</span>
            </button>
          </div>
        </div>

        {/* Right: Vehicle, Calibration, Orientation Switch (Portrait / Landscape), Sync */}
        <div className={`flex items-center gap-1.5 ${isPortrait ? 'flex-wrap w-full justify-between' : 'flex-nowrap shrink-0'}`}>
          <select
            aria-label="Pilih Kendaraan"
            disabled={isBusy}
            value={activeVehicle.id}
            onChange={(e) => onSelectVehicle(e.target.value)}
            className={`h-7 bg-[#07090E] border border-slate-800 text-xs font-medium text-slate-200 rounded-md px-2 truncate focus:outline-none focus:ring-1 focus:ring-red-500 ${
              isPortrait ? 'max-w-[140px]' : 'max-w-[96px] sm:max-w-[130px] lg:max-w-[175px]'
            }`}
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.weightKg}kg)
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 shrink-0">
            {sensorMode === 'live' && (
              <button
                type="button"
                disabled={isBusy || engine.isCalibrating}
                onClick={() => void engine.calibrateSensors()}
                className={`h-7 px-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                  engine.sensor.isCalibrated
                    ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300'
                    : 'bg-[#07090E] border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <Crosshair className="w-3 h-3" />
                <span>{engine.isCalibrating ? '...' : '0G'}</span>
              </button>
            )}

            {/* Layout Mode Switcher: Auto / Portrait / Landscape */}
            <div
              role="group"
              aria-label="Mode Tampilan"
              className="flex items-center h-7 bg-[#07090E] border border-slate-800 rounded-md p-0.5 shrink-0"
            >
              <button
                type="button"
                onClick={() => onChangeLayoutMode('auto')}
                title="Otomatis ikuti orientasi layar"
                className={`h-full px-1.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  layoutMode === 'auto'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => onChangeLayoutMode('portrait')}
                title="Mode Portrait"
                aria-label="Mode Portrait"
                className={`h-full px-1.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                  layoutMode === 'portrait'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3 h-3" />
                <span className="hidden lg:inline">Portrait</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeLayoutMode('landscape')}
                title="Mode Landscape"
                aria-label="Mode Landscape"
                className={`h-full px-1.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                  layoutMode === 'landscape'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Monitor className="w-3 h-3" />
                <span className="hidden lg:inline">Landscape</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenSyncTab}
              className="h-7 px-2 text-xs font-mono bg-[#07090E] border border-slate-800 hover:border-slate-700 rounded-md text-slate-300 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  connectionState === 'connected'
                    ? 'bg-emerald-500'
                    : connectionState === 'reconnecting'
                      ? 'bg-amber-400'
                      : 'bg-slate-600'
                }`}
              />
              <span>
                {roomId} · {clientsCount}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* BODY: PORTRAIT MODE vs LANDSCAPE MODE */}
      {isPortrait ? (
        /* PORTRAIT ZERO-SCROLL RACEBOX LAYOUT (centered upright frame on wide monitors, full width on mobile) */
        <div className="flex-1 min-h-0 flex justify-center p-2 overflow-hidden">
          <div className="w-full max-w-[460px] h-full flex flex-col gap-2 min-h-0">
            {/* Top Dual Hero Card: Speed + G-Force (left) & Tree + ET/RT (right) */}
            <section className="shrink-0 bg-[#0F131C] border border-slate-800/90 rounded-lg p-2.5 flex flex-col gap-2">
              {renderSensorStatusLine()}

              <div className="grid grid-cols-12 gap-2.5 items-center pt-1 border-t border-slate-800/70">
                {/* Speed & G */}
                <div className="col-span-6 pr-2 border-r border-slate-800/70">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400">
                      Speed
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-cyan-400">
                      Max {formatSpeed(engine.peakSpeedKmh)}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 mt-0.5 whitespace-nowrap">
                    <span className="font-mono font-bold tabular-nums tracking-tight text-white text-[clamp(1.6rem,6.5vw,2.25rem)] leading-none">
                      {engine.liveSpeedKmh.toFixed(1)}
                    </span>
                    <span className="font-display font-bold text-[11px] text-slate-400 uppercase shrink-0">
                      km/h
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#07090E] border border-slate-800 rounded-sm overflow-hidden mt-1.5">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-red-500 transition-[width] duration-75"
                      style={{ width: `${speedPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono tabular-nums mt-1.5 gap-1">
                    <span className="text-slate-400 flex items-center gap-1 min-w-0 truncate">
                      <span>G-Force</span>
                      {sensorMode === 'live' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={cycleSensitivity}
                          title="Ubah sensitivitas sensor 0G"
                          className="text-cyan-400 hover:text-cyan-300 underline decoration-dotted cursor-pointer disabled:opacity-50"
                        >
                          ({sensitivityLabel})
                        </button>
                      )}
                    </span>
                    <span className="text-amber-400 font-semibold shrink-0">
                      {engine.liveAccelG >= 0 ? '+' : ''}
                      {engine.liveAccelG.toFixed(2)}G
                    </span>
                  </div>
                  <div className="relative w-full h-1.5 bg-[#07090E] border border-slate-800 rounded-sm overflow-hidden mt-0.5">
                    <div
                      aria-hidden="true"
                      className="absolute top-0 bottom-0 left-[25%] w-px bg-slate-600 z-10"
                    />
                    <div
                      className={`absolute top-0 bottom-0 transition-all duration-75 ${
                        engine.liveAccelG >= 0 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{
                        left: `${gBarLeftPct}%`,
                        width: `${Math.max(1, gBarWidthPct)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* ET / RT / Christmas Tree */}
                <div className="col-span-6 flex flex-col justify-between gap-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 shrink-0">
                      ET {targetDistance}m
                    </span>
                    {etDeltaVsPb !== null && (
                      <span
                        className={`text-[10px] font-mono font-semibold tabular-nums truncate ${
                          etDeltaVsPb <= 0 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {etDeltaVsPb <= 0 ? '' : '+'}
                        {etDeltaVsPb.toFixed(3)}s
                      </span>
                    )}
                  </div>
                  <div className="whitespace-nowrap">
                    {engine.runState === 'redlight' ? (
                      <span className="font-mono font-bold text-lg text-red-500">RED LIGHT</span>
                    ) : (
                      <span className="font-mono font-bold tabular-nums text-[clamp(1.45rem,5.5vw,1.875rem)] leading-none text-white">
                        {displayEt.toFixed(3)}
                        <span className="text-[11px] text-slate-400 ml-0.5">s</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums">
                    <span className="text-slate-400">RT </span>
                    <span
                      className={
                        engine.runState === 'redlight'
                          ? 'text-red-400 font-semibold'
                          : engine.reactionTimeSec !== null
                            ? 'text-emerald-400 font-semibold'
                            : 'text-slate-500'
                      }
                    >
                      {engine.reactionTimeSec !== null
                        ? `${engine.reactionTimeSec.toFixed(3)}s`
                        : launchMode === 'rollout'
                          ? 'Rollout'
                          : '--.---'}
                    </span>
                  </div>
                  <div className="pt-0.5">
                    <ChristmasTree
                      runState={engine.runState}
                      treeStep={engine.treeStep}
                      launchMode={launchMode}
                      compact
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Middle Split Table + Quick Benchmarks */}
            <section className="shrink-0 bg-[#0F131C] border border-slate-800/90 rounded-lg px-2.5 py-2 flex flex-col gap-1.5">
              {renderSplitsRows(true)}
              <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-slate-800/80 text-[11px]">
                <div>
                  <span className="text-[10px] text-slate-500">0–60 </span>
                  <span className="font-mono font-semibold tabular-nums text-slate-200">
                    {engine.zeroTo60Sec !== null ? `${engine.zeroTo60Sec.toFixed(2)}s` : '--.--'}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[10px] text-slate-500">0–100 </span>
                  <span className="font-mono font-semibold tabular-nums text-slate-200">
                    {engine.zeroTo100Sec !== null ? `${engine.zeroTo100Sec.toFixed(2)}s` : '--.--'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500">WHP </span>
                  <span className="font-mono font-semibold tabular-nums text-emerald-400">
                    {engine.lastCompletedRun?.estimatedWhp ?? stats.peakEstWhp ?? '--'}
                  </span>
                </div>
              </div>
            </section>

            {/* Live Speed & Acceleration Chart (Fills Remaining Height) */}
            <section className="flex-1 min-h-0 overflow-hidden bg-[#0F131C] border border-slate-800/90 rounded-lg p-2 flex flex-col">
              <div className="shrink-0 flex items-center justify-between gap-2 pb-1 border-b border-slate-800/80">
                <h2 className="text-[11px] font-semibold text-slate-200 truncate">
                  Grafik Kecepatan &amp; Akselerasi
                </h2>
                <div className="flex items-center gap-2 text-[10px] font-mono shrink-0">
                  <span className="text-cyan-400">km/h</span>
                  <span className="text-amber-400">G</span>
                  {pbRun && <span className="text-slate-400">PB</span>}
                </div>
              </div>
              <div className="flex-1 min-h-0 pt-1">
                <TelemetryChart
                  samples={engine.samples}
                  pbSamples={pbRun?.samples}
                  splits={engine.splits}
                  targetDistance={targetDistance}
                  interactive={engine.runState === 'finished' || engine.runState === 'idle'}
                  heightClass="h-full"
                />
              </div>
            </section>

            {/* Bottom Thumb Zone Action CTA */}
            {renderActionButtons()}
          </div>
        </div>
      ) : (
        /* LANDSCAPE ZERO-SCROLL 3-COLUMN RACEBOX COCKPIT */
        <div className="flex-1 min-h-0 p-2 grid grid-cols-12 gap-2 overflow-hidden">
          {/* LEFT COLUMN: Speedometer + G-Force + Launch Action */}
          <section className="col-span-4 bg-[#0F131C] border border-slate-800/90 rounded-lg p-2 sm:p-3 flex flex-col justify-between min-h-0 overflow-hidden">
            <div className="shrink-0 h-6 sm:h-7 pb-1 border-b border-slate-800/80 flex items-center justify-between">
              {renderSensorStatusLine()}
            </div>

            <div className="flex-1 min-h-0 flex flex-col justify-center py-1 gap-2">
              <div>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                    Kecepatan
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-cyan-400 truncate">
                    Peak {formatSpeed(engine.peakSpeedKmh)} km/h
                  </span>
                </div>

                <div className="flex items-baseline gap-1.5 my-0.5 whitespace-nowrap">
                  <span className="font-mono font-bold tabular-nums tracking-tight text-white text-[clamp(1.8rem,min(5.5vw,8vh),4.25rem)] leading-none">
                    {engine.liveSpeedKmh.toFixed(1)}
                  </span>
                  <span className="font-display font-bold text-sm sm:text-lg text-slate-400 uppercase shrink-0">
                    km/h
                  </span>
                </div>

                {/* Segmented 20-bar Motorsport Velocity Gauge */}
                <div className="grid grid-cols-20 gap-0.5 h-2 sm:h-2.5">
                  {Array.from({ length: 20 }).map((_, idx) => {
                    const threshold = ((idx + 1) / 20) * 100;
                    const active = speedPct >= threshold - 2.5;
                    const color =
                      idx >= 16
                        ? 'bg-red-500'
                        : idx >= 12
                          ? 'bg-amber-400'
                          : idx >= 7
                            ? 'bg-emerald-400'
                            : 'bg-cyan-400';
                    return (
                      <div
                        key={idx}
                        className={`rounded-[1px] transition-colors duration-75 ${
                          active ? color : 'bg-[#07090E] border border-slate-800/80'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[10px] sm:text-[11px] mb-1 gap-1">
                  <span className="text-slate-400 flex items-center gap-1 min-w-0 truncate">
                    <span>Akselerasi</span>
                    {sensorMode === 'live' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={cycleSensitivity}
                        title="Ubah sensitivitas sensor 0G"
                        className="font-mono text-[10px] text-cyan-400 hover:text-cyan-300 underline decoration-dotted cursor-pointer disabled:opacity-50"
                      >
                        ({sensitivityLabel})
                      </button>
                    )}
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-amber-400 shrink-0">
                    {engine.liveAccelG >= 0 ? '+' : ''}
                    {engine.liveAccelG.toFixed(2)}G{' '}
                    <span className="text-slate-500 hidden md:inline">
                      (Max {engine.peakAccelG.toFixed(2)}G)
                    </span>
                  </span>
                </div>
                <div className="relative w-full h-2 sm:h-2.5 bg-[#07090E] border border-slate-800 rounded-sm overflow-hidden">
                  <div
                    aria-hidden="true"
                    className="absolute top-0 bottom-0 left-[25%] w-px bg-slate-600 z-10"
                  />
                  <div
                    className={`absolute top-0 bottom-0 transition-all duration-75 ${
                      engine.liveAccelG >= 0 ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                    style={{
                      left: `${gBarLeftPct}%`,
                      width: `${Math.max(1, gBarWidthPct)}%`,
                    }}
                  />
                </div>
                <div className="hidden sm:flex justify-between text-[9px] font-mono text-slate-600 mt-0.5 tabular-nums">
                  <span>-0.5G</span>
                  <span>0.0</span>
                  <span>+0.5G</span>
                  <span>+1.0G</span>
                  <span>+1.5G</span>
                </div>
              </div>
            </div>

            {renderActionButtons()}
          </section>

          {/* CENTER COLUMN: Christmas Tree, ET/RT Timer, & 20m / 100m / 201m / 402m Splits */}
          <section className="col-span-4 bg-[#0F131C] border border-slate-800/90 rounded-lg p-2 sm:p-3 flex flex-col justify-between min-h-0 overflow-hidden">
            <div className="shrink-0 h-6 sm:h-7 pb-1 border-b border-slate-800/80 flex items-center justify-between gap-1.5">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-200 truncate">
                Split {targetDistance}m
              </span>
              <ChristmasTree
                runState={engine.runState}
                treeStep={engine.treeStep}
                launchMode={launchMode}
                compact
              />
            </div>

            {/* Scoreboard ET + RT Highlight */}
            <div className="shrink-0 mt-1 bg-[#0A0D14] border border-slate-800/80 rounded-md px-2.5 py-1 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400">
                    ET
                  </span>
                  {etDeltaVsPb !== null && (
                    <span
                      className={`text-[10px] font-mono font-semibold tabular-nums truncate ${
                        etDeltaVsPb <= 0 ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {etDeltaVsPb <= 0 ? '' : '+'}
                      {etDeltaVsPb.toFixed(3)}s
                    </span>
                  )}
                </div>
                {engine.runState === 'redlight' ? (
                  <span className="font-mono font-bold text-base sm:text-xl text-red-500 tracking-tight">
                    RED LIGHT
                  </span>
                ) : (
                  <div className="font-mono font-bold tabular-nums text-[clamp(1.25rem,min(4vw,4.5vh),2.25rem)] leading-tight text-white whitespace-nowrap">
                    {displayEt.toFixed(3)}
                    <span className="text-[11px] text-slate-400 ml-0.5">s</span>
                  </div>
                )}
              </div>

              <div className="text-right pl-2 border-l border-slate-800/80 shrink-0">
                <div className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400">
                  RT
                </div>
                <div
                  className={`font-mono font-bold tabular-nums text-xs sm:text-sm ${
                    engine.runState === 'redlight'
                      ? 'text-red-400'
                      : engine.reactionTimeSec !== null
                        ? 'text-emerald-400'
                        : 'text-slate-500'
                  }`}
                >
                  {engine.reactionTimeSec !== null
                    ? `${engine.reactionTimeSec.toFixed(3)}s`
                    : launchMode === 'rollout'
                      ? 'Roll'
                      : '--.---'}
                </div>
              </div>
            </div>

            {renderSplitsRows(true)}

            <div className="shrink-0 grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-800/80 text-[11px]">
              <div className="truncate">
                <div className="text-[9px] text-slate-500">0–60</div>
                <div className="font-mono font-semibold tabular-nums text-slate-200">
                  {engine.zeroTo60Sec !== null ? `${engine.zeroTo60Sec.toFixed(2)}s` : '--.--'}
                </div>
              </div>
              <div className="truncate text-center">
                <div className="text-[9px] text-slate-500">0–100</div>
                <div className="font-mono font-semibold tabular-nums text-slate-200">
                  {engine.zeroTo100Sec !== null ? `${engine.zeroTo100Sec.toFixed(2)}s` : '--.--'}
                </div>
              </div>
              <div className="truncate text-right">
                <div className="text-[9px] text-slate-500">Est. WHP</div>
                <div className="font-mono font-semibold tabular-nums text-emerald-400">
                  {engine.lastCompletedRun?.estimatedWhp
                    ? `${engine.lastCompletedRun.estimatedWhp} HP`
                    : stats.peakEstWhp
                      ? `${stats.peakEstWhp} HP`
                      : '--'}
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT COLUMN: Visual Telemetry Graph (Speed km/h + Acceleration G) */}
          <section className="col-span-4 bg-[#0F131C] border border-slate-800/90 rounded-lg p-2 sm:p-3 flex flex-col min-h-0 overflow-hidden">
            <div className="shrink-0 h-6 sm:h-7 pb-1 border-b border-slate-800/80 flex items-center justify-between gap-2">
              <h2 className="text-[11px] sm:text-xs font-semibold text-slate-200 truncate">
                Grafik Kecepatan &amp; G
              </h2>
              <div className="flex items-center gap-2 text-[10px] font-mono shrink-0">
                <span className="flex items-center gap-1 text-cyan-400">
                  <span className="w-2 h-0.5 bg-cyan-400 inline-block" />
                  km/h
                </span>
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="w-2 h-0.5 bg-amber-400 inline-block" />
                  G
                </span>
                {pbRun && (
                  <span className="flex items-center gap-1 text-slate-400">
                    <span className="w-2 h-0.5 border-t border-dashed border-slate-400 inline-block" />
                    PB
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 pt-1">
              <TelemetryChart
                samples={engine.samples}
                pbSamples={pbRun?.samples}
                splits={engine.splits}
                targetDistance={targetDistance}
                interactive={engine.runState === 'finished' || engine.runState === 'idle'}
                heightClass="h-full"
              />
            </div>

            <div className="shrink-0 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-400 pt-1.5 border-t border-slate-800/80">
              <span>
                Best:{' '}
                <strong className="text-white">
                  {formatSec(targetDistance === 201 ? stats.best201m : stats.best402m)}s
                </strong>
              </span>
              <span>
                Trap:{' '}
                <strong className="text-cyan-400">
                  {formatSpeed(
                    pbRun ? getSplitValue(pbRun, targetDistance)?.speedKmh : null
                  )}{' '}
                  km/h
                </strong>
              </span>
              {runs.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    void exportRunsPdf(runs, { vehicleLabel: 'Semua Kendaraan', roomId })
                  }
                  title="Export semua run ke PDF"
                  className="px-2 py-0.5 bg-[#07090E] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded flex items-center gap-1 cursor-pointer"
                >
                  <FileText className="w-3 h-3 text-red-400" />
                  <span>PDF</span>
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {showStartOverlay && (
        <StartTreeOverlay
          runState={engine.runState}
          treeStep={engine.treeStep}
          reactionTimeSec={engine.reactionTimeSec}
          targetDistance={targetDistance}
          sensorMode={sensorMode}
          isPortrait={isPortrait}
          onTriggerLaunch={engine.triggerManualLaunch}
          onCancel={engine.resetRun}
          onRestart={() => engine.startRace()}
        />
      )}
    </div>
  );
}
