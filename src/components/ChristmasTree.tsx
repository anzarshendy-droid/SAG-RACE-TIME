import { RotateCcw, Play, Zap } from 'lucide-react';
import type { LaunchMode, RunState, SensorMode } from '../types/telemetry';

interface ChristmasTreeProps {
  runState: RunState;
  treeStep: number; // 0=off, 1..3=amber, 4=green, -1=redlight
  launchMode: LaunchMode;
  compact?: boolean;
  large?: boolean;
}

export function ChristmasTree({
  runState,
  treeStep,
  launchMode,
  compact = false,
  large = false,
}: ChristmasTreeProps) {
  const isStaged =
    runState === 'staging' ||
    runState === 'countdown' ||
    runState === 'armed' ||
    runState === 'running' ||
    runState === 'finished' ||
    runState === 'redlight';

  const amber1 = treeStep >= 1 && treeStep <= 4;
  const amber2 = treeStep >= 2 && treeStep <= 4;
  const amber3 = treeStep >= 3 && treeStep <= 4;
  const green = treeStep === 4;
  const red = treeStep === -1 || runState === 'redlight';

  if (launchMode === 'rollout') {
    const isArmed = runState === 'armed' || runState === 'staging';
    const isRunning = runState === 'running';
    return (
      <div className="max-w-full overflow-hidden flex items-center gap-1.5 bg-[#0A0D14] border border-slate-800 rounded-md px-2 py-1">
        <span
          className={`w-3 h-3 rounded-full border ${
            isRunning
              ? 'bg-emerald-500 border-emerald-300 shadow-[0_0_10px_#10b981]'
              : isArmed
                ? 'bg-amber-400 border-amber-200 shadow-[0_0_8px_#f59e0b]'
                : 'bg-slate-800 border-slate-700'
          }`}
        />
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-300 whitespace-nowrap">
          {isRunning
            ? 'ROLLOUT AKTIF'
            : isArmed
              ? 'SIAP LAUNCH'
              : runState === 'finished'
                ? 'FINISH'
                : 'AUTO ROLLOUT'}
        </span>
      </div>
    );
  }

  const lampSize = large
    ? 'w-8 h-8 sm:w-10 sm:h-10'
    : compact
      ? 'w-3 h-3 sm:w-3.5 sm:h-3.5'
      : 'w-4 h-4';

  const stageDotSize = large ? 'w-2.5 h-2.5 sm:w-3 sm:h-3' : 'w-1.5 h-1.5 sm:w-2 sm:h-2';

  return (
    <div
      className={`w-fit max-w-full flex items-center bg-[#0A0D14] border border-slate-800 rounded-md ${
        large ? 'gap-2 sm:gap-2.5 px-3 py-2 rounded-xl border-slate-700/90' : 'gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1'
      }`}
      aria-label="Lampu Start Drag Race"
    >
      <div className={`flex flex-col ${large ? 'gap-1 pr-2' : 'gap-0.5 pr-1'} border-r border-slate-800`}>
        <span
          className={`${stageDotSize} rounded-full ${
            isStaged ? 'bg-amber-300 shadow-[0_0_8px_#fcd34d]' : 'bg-slate-800'
          }`}
        />
        <span
          className={`${stageDotSize} rounded-full ${
            isStaged && runState !== 'staging'
              ? 'bg-amber-300 shadow-[0_0_8px_#fcd34d]'
              : 'bg-slate-800'
          }`}
        />
      </div>

      <span
        className={`${lampSize} rounded-full border transition-colors duration-75 flex items-center justify-center ${
          amber1
            ? 'bg-amber-400 border-amber-200 shadow-[0_0_16px_#f59e0b]'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        {large && (
          <span className={`font-mono font-bold text-[10px] ${amber1 ? 'text-amber-950' : 'text-slate-700'}`}>
            1
          </span>
        )}
      </span>
      <span
        className={`${lampSize} rounded-full border transition-colors duration-75 flex items-center justify-center ${
          amber2
            ? 'bg-amber-400 border-amber-200 shadow-[0_0_16px_#f59e0b]'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        {large && (
          <span className={`font-mono font-bold text-[10px] ${amber2 ? 'text-amber-950' : 'text-slate-700'}`}>
            2
          </span>
        )}
      </span>
      <span
        className={`${lampSize} rounded-full border transition-colors duration-75 flex items-center justify-center ${
          amber3
            ? 'bg-amber-400 border-amber-200 shadow-[0_0_16px_#f59e0b]'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        {large && (
          <span className={`font-mono font-bold text-[10px] ${amber3 ? 'text-amber-950' : 'text-slate-700'}`}>
            3
          </span>
        )}
      </span>
      <span
        className={`${lampSize} rounded-full border transition-colors duration-75 flex items-center justify-center ${
          green
            ? 'bg-emerald-500 border-emerald-200 shadow-[0_0_20px_#10b981]'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        {large && (
          <span className={`font-display font-bold text-[10px] ${green ? 'text-emerald-950' : 'text-slate-700'}`}>
            GO
          </span>
        )}
      </span>
      <span
        className={`${lampSize} rounded-full border transition-colors duration-75 flex items-center justify-center ${
          red
            ? 'bg-red-500 border-red-200 shadow-[0_0_20px_#ef4444]'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        {large && (
          <span className={`font-display font-bold text-[9px] ${red ? 'text-white' : 'text-slate-700'}`}>
            FL
          </span>
        )}
      </span>
    </div>
  );
}

interface StartTreeOverlayProps {
  runState: RunState;
  treeStep: number;
  reactionTimeSec: number | null;
  targetDistance: 201 | 402;
  sensorMode: SensorMode;
  isPortrait: boolean;
  onTriggerLaunch: () => void;
  onCancel: () => void;
  onRestart: () => void;
  onDismissOverlay?: () => void;
}

export function StartTreeOverlay({
  runState,
  treeStep,
  reactionTimeSec,
  targetDistance,
  sensorMode,
  isPortrait,
  onTriggerLaunch,
  onCancel,
  onRestart,
  onDismissOverlay,
}: StartTreeOverlayProps) {
  const isStaged = runState !== 'idle';
  const deepStage = isStaged && runState !== 'staging';
  const amber1 = treeStep >= 1 && treeStep <= 4;
  const amber2 = treeStep >= 2 && treeStep <= 4;
  const amber3 = treeStep >= 3 && treeStep <= 4;
  const green = treeStep === 4;
  const red = treeStep === -1 || runState === 'redlight';

  const bulbBase = isPortrait
    ? 'w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 transition-all duration-75 flex items-center justify-center'
    : 'w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full border-2 transition-all duration-75 flex items-center justify-center';

  const statusText =
    runState === 'redlight'
      ? 'RED LIGHT · JUMP START'
      : runState === 'running'
        ? `GO! RT ${reactionTimeSec !== null ? `${reactionTimeSec.toFixed(3)}s` : ''}`
        : runState === 'armed'
          ? 'GO! JALAN!'
          : runState === 'countdown'
            ? 'SIAP LAUNCH...'
            : 'STAGE · POSISI START';

  const statusColor =
    runState === 'redlight'
      ? 'text-red-400'
      : runState === 'armed' || runState === 'running'
        ? 'text-emerald-400'
        : 'text-amber-300';

  return (
    <div
      role="dialog"
      aria-label="Lampu Start Besar"
      className="fixed top-11 inset-x-0 bottom-0 z-40 bg-[#07090E]/95 backdrop-blur-sm flex flex-col items-center justify-center gap-3 sm:gap-4 p-3 select-none"
    >
      {/* Top Label */}
      <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-slate-400">
        <span>START TREE · {targetDistance}M</span>
        <span aria-hidden="true">·</span>
        <span className={deepStage ? 'text-amber-300 font-semibold' : 'text-slate-500'}>
          {deepStage ? 'STAGE LOCKED' : 'PRE-STAGE'}
        </span>
      </div>

      {/* Enlarged Christmas Tree Rack */}
      <div
        className={`bg-[#0B0F18] border border-slate-700/90 rounded-2xl p-3 sm:p-5 shadow-2xl flex ${
          isPortrait ? 'flex-col items-center gap-2.5' : 'flex-row items-center gap-3 sm:gap-5'
        }`}
      >
        {/* Pre-stage & Stage Indicator Bulbs */}
        <div
          className={`flex ${
            isPortrait
              ? 'flex-row gap-4 pb-2 border-b border-slate-800 w-full justify-center'
              : 'flex-col gap-3 pr-3 sm:pr-4 border-r border-slate-800'
          }`}
        >
          <div className="flex flex-col items-center gap-1">
            <span
              className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border ${
                isStaged
                  ? 'bg-amber-300 border-amber-100 shadow-[0_0_16px_#fcd34d]'
                  : 'bg-slate-900 border-slate-700'
              }`}
            />
            <span className="text-[9px] font-mono text-slate-400">PRE</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span
              className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border ${
                deepStage
                  ? 'bg-amber-300 border-amber-100 shadow-[0_0_16px_#fcd34d]'
                  : 'bg-slate-900 border-slate-700'
              }`}
            />
            <span className="text-[9px] font-mono text-slate-400">STG</span>
          </div>
        </div>

        {/* 3 Amber Bulbs */}
        <div
          className={`${bulbBase} ${
            amber1
              ? 'bg-amber-400 border-amber-200 shadow-[0_0_36px_rgba(245,158,11,0.9)] scale-105'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <span
            className={`font-mono font-bold text-xs ${
              amber1 ? 'text-amber-950' : 'text-slate-700'
            }`}
          >
            1
          </span>
        </div>

        <div
          className={`${bulbBase} ${
            amber2
              ? 'bg-amber-400 border-amber-200 shadow-[0_0_36px_rgba(245,158,11,0.9)] scale-105'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <span
            className={`font-mono font-bold text-xs ${
              amber2 ? 'text-amber-950' : 'text-slate-700'
            }`}
          >
            2
          </span>
        </div>

        <div
          className={`${bulbBase} ${
            amber3
              ? 'bg-amber-400 border-amber-200 shadow-[0_0_36px_rgba(245,158,11,0.9)] scale-105'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <span
            className={`font-mono font-bold text-xs ${
              amber3 ? 'text-amber-950' : 'text-slate-700'
            }`}
          >
            3
          </span>
        </div>

        {/* Green GO + Red Foul */}
        <div className={`flex ${isPortrait ? 'flex-row gap-4 pt-1' : 'flex-row gap-3 sm:gap-5'}`}>
          <div
            className={`${bulbBase} ${
              green
                ? 'bg-emerald-500 border-emerald-200 shadow-[0_0_48px_rgba(16,185,129,0.95)] scale-110'
                : 'bg-slate-900/90 border-slate-800'
            }`}
          >
            <span
              className={`font-display font-extrabold text-sm sm:text-base tracking-wider ${
                green ? 'text-emerald-950' : 'text-slate-700'
              }`}
            >
              GO
            </span>
          </div>

          <div
            className={`${bulbBase} ${
              red
                ? 'bg-red-600 border-red-200 shadow-[0_0_48px_rgba(239,68,68,0.95)] scale-110'
                : 'bg-slate-900/90 border-slate-800'
            }`}
          >
            <span
              className={`font-display font-extrabold text-xs sm:text-sm tracking-wider ${
                red ? 'text-white' : 'text-slate-700'
              }`}
            >
              FOUL
            </span>
          </div>
        </div>
      </div>

      {/* Big Status Text */}
      <div className={`font-display font-extrabold text-2xl sm:text-3xl tracking-wide ${statusColor}`}>
        {statusText}
      </div>

      {/* Action Controls inside Start Overlay */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {sensorMode === 'simulation' &&
          (runState === 'countdown' || runState === 'armed') && (
            <button
              type="button"
              onClick={onTriggerLaunch}
              className="min-h-[48px] px-7 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-display font-bold text-xl tracking-wide uppercase rounded-lg transition-all cursor-pointer flex items-center gap-2 shadow-lg"
            >
              <Zap className="w-5 h-5" />
              <span>GAS / LAUNCH! (Spasi)</span>
            </button>
          )}

        {runState === 'redlight' ? (
          <>
            <button
              type="button"
              onClick={onRestart}
              className="min-h-[44px] px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-display font-bold text-lg tracking-wide uppercase rounded-lg cursor-pointer flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>RACE LAGI</span>
            </button>
            <button
              type="button"
              onClick={onDismissOverlay ?? onCancel}
              className="min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-sm rounded-lg cursor-pointer"
            >
              Tutup
            </button>
          </>
        ) : (
          <>
            {runState !== 'running' && (
              <button
                type="button"
                onClick={onCancel}
                className="min-h-[44px] px-5 py-2 bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-xs sm:text-sm rounded-lg cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{onDismissOverlay ? 'Reset Lampu' : 'Batalkan'}</span>
              </button>
            )}
            {onDismissOverlay && (
              <button
                type="button"
                onClick={onDismissOverlay}
                className="min-h-[44px] px-4 py-2 bg-[#0F131C] hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium text-xs sm:text-sm rounded-lg cursor-pointer"
              >
                Kecilkan
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
