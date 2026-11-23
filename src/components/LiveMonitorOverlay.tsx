import { Minimize2, Play, RotateCcw } from 'lucide-react';
import type { LiveTelemetryPayload, RaceDistance } from '../types/telemetry';

interface LiveMonitorOverlayProps {
  roomId: string;
  telemetry: LiveTelemetryPayload;
  clientsCount: number;
  remoteDistance: RaceDistance;
  onMinimize: () => void;
  onReset: () => void;
  onRestartTree: () => void;
}

export function LiveMonitorOverlay({
  roomId,
  telemetry,
  clientsCount,
  remoteDistance,
  onMinimize,
  onReset,
  onRestartTree,
}: LiveMonitorOverlayProps) {
  const isFinished = telemetry.runState === 'finished';
  const isRedLight = telemetry.runState === 'redlight';
  const isRunning = telemetry.runState === 'running';

  const progressPct = Math.max(
    0,
    Math.min(100, (telemetry.distanceM / Math.max(1, telemetry.targetDistance)) * 100)
  );

  const stateTitle = isRedLight
    ? 'RED LIGHT · FOUL'
    : isFinished
      ? 'FINISH · HASIL AKHIR'
      : isRunning
        ? 'LIVE RUN BERJALAN'
        : telemetry.runState === 'countdown' || telemetry.runState === 'staging'
          ? 'PERSIAPAN START'
          : 'STANDBY TELEMETRI';

  const stateColor = isRedLight
    ? 'text-red-500'
    : isFinished
      ? 'text-cyan-400'
      : isRunning
        ? 'text-emerald-400'
        : 'text-amber-400';

  return (
    <div
      role="dialog"
      aria-label="Monitor Telemetri Live Layar Penuh"
      className="fixed inset-0 z-50 bg-[#07090E] flex flex-col justify-between p-4 sm:p-6 overflow-y-auto sag-scroll select-none"
    >
      {/* Top Telemetry Ribbon */}
      <header className="w-full max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/90">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className={`font-display font-bold text-sm sm:text-base tracking-wide ${stateColor}`}>
            {stateTitle}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-mono text-slate-400">
            <span className="text-white font-semibold">Room {roomId}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate max-w-[200px] sm:max-w-none">{telemetry.vehicleName}</span>
            <span aria-hidden="true">·</span>
            <span>Target {telemetry.targetDistance}m</span>
            <span aria-hidden="true">·</span>
            <span>{telemetry.sensorMode === 'live' ? 'GPS+IMU' : 'Simulasi'}</span>
            <span aria-hidden="true">·</span>
            <span className="text-cyan-400">{clientsCount} perangkat</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onMinimize}
          className="min-h-[44px] px-4 py-2 bg-[#0F131C] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs sm:text-sm font-semibold rounded-lg flex items-center gap-2 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          <Minimize2 className="w-4 h-4" />
          <span>Kecilkan</span>
        </button>
      </header>

      {/* Main High-Contrast Telemetry Stage */}
      <main className="w-full max-w-6xl mx-auto flex-1 flex flex-col justify-center gap-4 sm:gap-6 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch">
          {/* Primary Anchor: Live Speed */}
          <div className="lg:col-span-6 bg-[#0F131C] border border-slate-800 rounded-xl p-5 sm:p-7 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-slate-400">
              <span>Kecepatan Live</span>
              <span className="text-amber-400 tabular-nums">
                {telemetry.accelG >= 0 ? '+' : ''}
                {telemetry.accelG.toFixed(2)} G
              </span>
            </div>

            <div className="flex items-baseline gap-3">
              <span className="font-mono font-bold text-6xl sm:text-8xl xl:text-9xl leading-none tabular-nums text-white tracking-tight">
                {telemetry.speedKmh.toFixed(1)}
              </span>
              <span className="font-mono text-lg sm:text-2xl uppercase text-slate-400 font-semibold">
                km/h
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm font-mono tabular-nums text-slate-400 pt-2 border-t border-slate-800/80">
              <span>
                Peak Speed:{' '}
                <strong className="text-cyan-400">{telemetry.peakSpeedKmh.toFixed(1)} km/h</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Peak G: <strong className="text-amber-400">{telemetry.peakAccelG.toFixed(2)} G</strong>
              </span>
            </div>
          </div>

          {/* Elapsed Time & Reaction Time */}
          <div className="lg:col-span-6 bg-[#0F131C] border border-slate-800 rounded-xl p-5 sm:p-7 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-slate-400">
              <span>Elapsed Time (ET)</span>
              <span className="tabular-nums text-slate-300">
                Jarak {telemetry.distanceM.toFixed(1)} / {telemetry.targetDistance}m
              </span>
            </div>

            <div
              className={`font-mono font-bold text-6xl sm:text-7xl xl:text-8xl leading-none tabular-nums tracking-tight ${
                isRedLight ? 'text-red-500' : isFinished ? 'text-emerald-400' : 'text-white'
              }`}
            >
              {isRedLight ? 'RED LIGHT' : `${telemetry.elapsedSec.toFixed(3)}s`}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm font-mono tabular-nums text-slate-400 pt-2 border-t border-slate-800/80">
              <span>
                Reaction Time (RT):{' '}
                <strong className={isRedLight ? 'text-red-400' : 'text-emerald-400'}>
                  {telemetry.reactionTimeSec !== null
                    ? `${telemetry.reactionTimeSec.toFixed(3)}s`
                    : '--.---'}
                </strong>
              </span>
              {telemetry.gpsAccuracyM !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>GPS ±{telemetry.gpsAccuracyM.toFixed(1)}m</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Distance Progress Track */}
        <div className="bg-[#0F131C] border border-slate-800 rounded-xl px-4 py-3 sm:px-5 sm:py-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-400">
            <span>Progres Lintasan ({telemetry.targetDistance}m)</span>
            <span className="text-white font-semibold">{progressPct.toFixed(0)}%</span>
          </div>
          <div className="w-full h-3 sm:h-4 bg-[#07090E] border border-slate-800 rounded-md overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                isRedLight ? 'bg-red-600' : isFinished ? 'bg-cyan-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* 4-Column Split Telemetry Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {([20, 100, 201, 402] as const).map((d) => {
            const sp = telemetry.splits.find((s) => s.distance === d);
            const isTargetSplit = d === telemetry.targetDistance;
            const isBeyondTarget = d > telemetry.targetDistance;
            return (
              <div
                key={d}
                className={`rounded-xl p-4 border flex flex-col gap-1 font-mono tabular-nums ${
                  sp
                    ? isTargetSplit
                      ? 'bg-emerald-950/25 border-emerald-500/70'
                      : 'bg-[#0F131C] border-cyan-500/60'
                    : isBeyondTarget
                      ? 'bg-[#0B0E16] border-slate-800/50 opacity-50'
                      : 'bg-[#0F131C] border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-xs uppercase text-slate-400">
                  <span className="font-semibold text-slate-300">Split {d}m</span>
                  {isTargetSplit && <span className="text-emerald-400 font-semibold">FINISH</span>}
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white mt-1">
                  {sp ? `${sp.timeSec.toFixed(3)}s` : '--.---'}
                </div>
                <div className="text-xs sm:text-sm text-cyan-400">
                  {sp ? `${sp.speedKmh.toFixed(1)} km/h` : '--.- km/h'}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Bottom Action Bar */}
      <footer className="w-full max-w-6xl mx-auto pt-3 border-t border-slate-800/90 flex flex-wrap items-center justify-center sm:justify-end gap-3">
        {(isFinished || isRedLight) && (
          <button
            type="button"
            onClick={onRestartTree}
            className="min-h-[44px] px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold text-base sm:text-lg tracking-wide uppercase rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start Lampu Lagi ({remoteDistance}m)</span>
          </button>
        )}

        <button
          type="button"
          onClick={onReset}
          className="min-h-[44px] px-5 py-2 bg-[#0F131C] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs sm:text-sm font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset Race</span>
        </button>

        <button
          type="button"
          onClick={onMinimize}
          className="min-h-[44px] px-5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs sm:text-sm font-semibold rounded-lg flex items-center gap-2 cursor-pointer"
        >
          <Minimize2 className="w-4 h-4" />
          <span>Kecilkan</span>
        </button>
      </footer>
    </div>
  );
}
