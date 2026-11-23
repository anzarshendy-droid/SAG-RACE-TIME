import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  FileText,
  Maximize2,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Zap,
} from 'lucide-react';
import type { SyncConnectionState, SyncTransportMode } from '../hooks/useRealtimeSync';
import { exportRunsPdf } from '../lib/exportPdf';
import type {
  DragRunRecord,
  LaunchMode,
  LiveTelemetryPayload,
  RaceDistance,
  RemoteRaceCommand,
} from '../types/telemetry';
import { ChristmasTree, StartTreeOverlay } from './ChristmasTree';
import { LiveMonitorOverlay } from './LiveMonitorOverlay';

interface PitSyncViewProps {
  roomId: string;
  onChangeRoom: (nextRoom: string) => void;
  clientsCount: number;
  connectionState: SyncConnectionState;
  transportMode: SyncTransportMode;
  lastSyncTs: number | null;
  liveTelemetry: LiveTelemetryPayload | null;
  runs: DragRunRecord[];
  onReconnect: () => void;
  onSendRaceCommand: (
    action: RemoteRaceCommand['action'],
    options?: { targetDistance?: RaceDistance; launchMode?: LaunchMode }
  ) => Promise<boolean>;
}

export function PitSyncView({
  roomId,
  onChangeRoom,
  clientsCount,
  connectionState,
  transportMode,
  lastSyncTs,
  liveTelemetry,
  runs,
  onReconnect,
  onSendRaceCommand,
}: PitSyncViewProps) {
  const [roomInput, setRoomInput] = useState(roomId);
  const [copied, setCopied] = useState(false);
  const [remoteDistance, setRemoteDistance] = useState<RaceDistance>(201);
  const [remoteNotice, setRemoteNotice] = useState<string | null>(null);
  const [enableBigLights, setEnableBigLights] = useState<boolean>(true);
  const [enableBigMonitor, setEnableBigMonitor] = useState<boolean>(true);
  const [dismissedThisCycle, setDismissedThisCycle] = useState<boolean>(false);
  const [dismissedMonitorThisCycle, setDismissedMonitorThisCycle] = useState<boolean>(false);
  const [sawRunningThisCycle, setSawRunningThisCycle] = useState<boolean>(false);
  const [manualMonitorOpen, setManualMonitorOpen] = useState<boolean>(false);
  const [pendingStartOverlay, setPendingStartOverlay] = useState<boolean>(false);
  const [showGoFlash, setShowGoFlash] = useState<boolean>(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : true
  );

  useEffect(() => {
    const onResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const remoteRunState = liveTelemetry?.runState ?? 'idle';

  useEffect(() => {
    if (remoteRunState === 'staging' || remoteRunState === 'countdown') {
      setPendingStartOverlay(false);
    }
    if (remoteRunState === 'staging' || remoteRunState === 'countdown' || remoteRunState === 'armed') {
      setSawRunningThisCycle(false);
      setDismissedMonitorThisCycle(false);
      setManualMonitorOpen(false);
    }
    if (remoteRunState === 'idle') {
      setDismissedThisCycle(false);
      setDismissedMonitorThisCycle(false);
      setSawRunningThisCycle(false);
      setShowGoFlash(false);
    } else if (remoteRunState === 'finished') {
      setDismissedThisCycle(false);
      setShowGoFlash(false);
    } else if (remoteRunState === 'running') {
      setSawRunningThisCycle(true);
      setShowGoFlash(true);
      const t = setTimeout(() => setShowGoFlash(false), 550);
      return () => clearTimeout(t);
    }
  }, [remoteRunState]);

  const showRemoteStartOverlay =
    enableBigLights &&
    !dismissedThisCycle &&
    (pendingStartOverlay ||
      remoteRunState === 'staging' ||
      remoteRunState === 'countdown' ||
      remoteRunState === 'armed' ||
      remoteRunState === 'redlight' ||
      (remoteRunState === 'running' && showGoFlash));

  const showLiveMonitorOverlay =
    Boolean(liveTelemetry) &&
    !showRemoteStartOverlay &&
    (manualMonitorOpen ||
      (enableBigMonitor &&
        !dismissedMonitorThisCycle &&
        (remoteRunState === 'running' || (remoteRunState === 'finished' && sawRunningThisCycle))));

  const [customPublicUrl, setCustomPublicUrl] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return (
        window.localStorage.getItem('sag_public_web_url') ||
        (import.meta.env.VITE_PUBLIC_WEB_URL as string | undefined) ||
        ''
      );
    } catch {
      return '';
    }
  });

  const isLocalNativeOrigin =
    typeof window !== 'undefined' &&
    (window.location.protocol === 'capacitor:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  const isAiStudioPreview =
    typeof window !== 'undefined' &&
    (window.location.hostname.startsWith('ais-dev-') ||
      window.location.hostname.startsWith('ais-pre-'));

  const normalizedCustomBase = customPublicUrl.trim().replace(/\/+$/, '');
  const hasValidCustomBase = /^https?:\/\/[^/\s]+/i.test(normalizedCustomBase);

  const shareBaseOrigin = hasValidCustomBase
    ? normalizedCustomBase
    : typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname === '/' ? '' : window.location.pathname}`
      : '';

  const shareUrl = shareBaseOrigin
    ? `${shareBaseOrigin.replace(/\/+$/, '')}/?room=${encodeURIComponent(roomId)}&tab=sync`
    : '';

  const copyTextSafely = async (text: string): Promise<boolean> => {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(el);
        return ok;
      } catch {
        return false;
      }
    }
  };

  const handleSaveCustomPublicUrl = (val: string) => {
    setCustomPublicUrl(val);
    try {
      const cleaned = val.trim();
      if (cleaned) {
        window.localStorage.setItem('sag_public_web_url', cleaned);
      } else {
        window.localStorage.removeItem('sag_public_web_url');
      }
    } catch {
      // ignore storage errors
    }
  };

  const handleCopy = async () => {
    if (await copyTextSafely(shareUrl)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    onChangeRoom(roomInput);
  };

  const statusLabel =
    connectionState === 'connected'
      ? transportMode === 'ws'
        ? 'Terhubung Real-Time (WS)'
        : transportMode === 'relay'
          ? 'Terhubung Real-Time (Cloud)'
          : 'Terhubung Sync (HTTPS)'
      : connectionState === 'reconnecting'
        ? 'Menyambungkan Ulang...'
        : connectionState === 'connecting'
          ? 'Menghubungkan...'
          : 'Offline (Cache Lokal)';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto sag-scroll bg-[#07090E] p-3 md:p-5">
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display font-bold text-2xl text-white tracking-tight">
              Pit Wall &amp; Sinkronisasi Real-Time
            </h1>
            <p className="text-xs text-slate-400">
              Hubungkan smartphone pengemudi dan layar pit crew menggunakan kode channel yang sama
              untuk melihat telemetri kecepatan, G-force, RT, dan hasil run secara langsung.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs font-mono bg-[#0F131C] border border-slate-800 px-3 py-2 rounded-md">
              <span
                className={`w-2 h-2 rounded-full ${
                  connectionState === 'connected'
                    ? 'bg-emerald-500'
                    : connectionState === 'reconnecting' || connectionState === 'connecting'
                      ? 'bg-amber-400'
                      : 'bg-slate-600'
                }`}
              />
              <span className="text-slate-200">{statusLabel}</span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="text-cyan-400">{clientsCount} perangkat</span>
            </div>
            <button
              type="button"
              onClick={onReconnect}
              title="Sambungkan ulang sekarang"
              className="px-2.5 py-2 text-xs font-medium bg-[#0F131C] hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-md flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sync</span>
            </button>
          </div>
        </div>

        {/* Room Join & Share Link */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <form
            onSubmit={handleJoin}
            className="md:col-span-6 bg-[#0F131C] border border-slate-800/90 rounded-lg p-4 flex flex-col gap-3"
          >
            <div className="text-xs font-semibold text-white">Kode Channel Sinkronisasi</div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={24}
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                placeholder="SAG-01"
                className="flex-1 bg-[#07090E] border border-slate-800 rounded-md px-3 py-2 text-sm font-mono font-semibold text-white uppercase focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Gabung Room</span>
              </button>
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              Sinkronisasi terakhir:{' '}
              {lastSyncTs ? new Date(lastSyncTs).toLocaleTimeString('id-ID') : 'Belum ada'}
            </div>
          </form>

          <div className="md:col-span-6 bg-[#0F131C] border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-white">Bagikan Link Monitor Pit Crew</div>
              {(isLocalNativeOrigin || isAiStudioPreview) && !hasValidCustomBase && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-950/70 border border-amber-600/60 text-amber-300">
                  {isLocalNativeOrigin ? 'Mode APK (Localhost)' : 'Link Preview AI Studio'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 bg-[#07090E] border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-300 select-all"
              />
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-medium rounded-md flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin' : 'Salin Link'}</span>
              </button>
            </div>
            {(isLocalNativeOrigin || isAiStudioPreview) && !hasValidCustomBase && (
              <div className="bg-amber-950/40 border border-amber-700/50 rounded-md px-2.5 py-2 text-[11px] text-amber-200 leading-relaxed">
                {isLocalNativeOrigin ? (
                  <>
                    Anda sedang membuka dari <strong>APK Android</strong>, sehingga link otomatis masih{' '}
                    <code className="font-mono text-white">localhost</code> dan <strong>tidak bisa dibuka di iPhone/HP lain</strong>.
                    Tempel URL web publik (Vercel) di bawah, atau cukup buka app di HP lain lalu ketik Kode Room{' '}
                    <strong className="font-mono text-white">{roomId}</strong>.
                  </>
                ) : (
                  <>
                    Link <code className="font-mono text-white">ais-dev / ais-pre</code> dibatasi akun Google AI Studio dan tidak terbuka bebas di HP lain.
                    Agar link monitor bisa dibuka di iPhone/HP siapa saja, deploy ke <strong>Vercel</strong> lalu tempel URL Vercel di bawah (atau buka app Vercel &amp; masukkan Kode Room{' '}
                    <strong className="font-mono text-white">{roomId}</strong>).
                  </>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="sag-public-url-input" className="text-[10px] text-slate-400">
                URL Web Publik Opsional (mis. https://nama-app.vercel.app) agar link monitor bisa dibuka semua HP:
              </label>
              <input
                id="sag-public-url-input"
                type="url"
                value={customPublicUrl}
                onChange={(e) => handleSaveCustomPublicUrl(e.target.value)}
                placeholder="https://sag-race-time.vercel.app"
                className="bg-[#07090E] border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
          </div>
        </div>

        {/* Remote Starter Control (Start Lampu dari Perangkat Kedua) */}
        <div className="bg-[#0F131C] border border-slate-800/90 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h2 className="font-semibold text-sm text-white">
                Kontrol Lampu Start (Starter Perangkat Kedua)
              </h2>
              <p className="text-[11px] text-slate-400">
                Pencet tombol di bawah dari HP starter/pit untuk menyalakan lampu start di HP pengemudi (tab Cockpit, room{' '}
                <span className="font-mono text-white">{roomId}</span>).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEnableBigLights((v) => !v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  enableBigLights
                    ? 'bg-emerald-950/60 border-emerald-600/70 text-emerald-300'
                    : 'bg-[#07090E] border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                Lampu Layar Penuh: {enableBigLights ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => setEnableBigMonitor((v) => !v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  enableBigMonitor
                    ? 'bg-cyan-950/60 border-cyan-600/70 text-cyan-300'
                    : 'bg-[#07090E] border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                Monitor Live Besar: {enableBigMonitor ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          <div className="flex justify-center py-1">
            <ChristmasTree
              runState={liveTelemetry?.runState ?? 'idle'}
              treeStep={liveTelemetry?.treeStep ?? 0}
              launchMode="tree"
              large
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center h-10 bg-[#07090E] border border-slate-800 rounded-md p-0.5 shrink-0">
              {([201, 402] as RaceDistance[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setRemoteDistance(d)}
                  className={`h-full px-3 text-xs font-mono font-bold rounded transition-colors cursor-pointer ${
                    remoteDistance === d
                      ? 'bg-red-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {d}m
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={async () => {
                setDismissedThisCycle(false);
                if (enableBigLights) {
                  setPendingStartOverlay(true);
                  setTimeout(() => setPendingStartOverlay(false), 2500);
                }
                const ok = await onSendRaceCommand('start_tree', {
                  targetDistance: remoteDistance,
                  launchMode: 'tree',
                });
                if (!ok) {
                  setPendingStartOverlay(false);
                }
                setRemoteNotice(
                  ok
                    ? `Lampu start ${remoteDistance}m dikirim ke pengemudi (${roomId})`
                    : 'Gagal mengirim perintah — cek koneksi'
                );
                setTimeout(() => setRemoteNotice(null), 3500);
              }}
              className="flex-1 min-w-[180px] min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-display font-bold text-base sm:text-lg tracking-wide uppercase rounded-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>START LAMPU ({remoteDistance}M)</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                const ok = await onSendRaceCommand('start_rollout', {
                  targetDistance: remoteDistance,
                  launchMode: 'rollout',
                });
                setRemoteNotice(
                  ok
                    ? `Mulai Race (${remoteDistance}m Rollout) dikirim ke pengemudi (${roomId})`
                    : 'Gagal mengirim perintah — cek koneksi'
                );
                setTimeout(() => setRemoteNotice(null), 3500);
              }}
              className="flex-1 min-w-[180px] min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-500 active:scale-[0.99] text-white font-display font-bold text-base sm:text-lg tracking-wide uppercase rounded-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              <span>MULAI RACE ({remoteDistance}M)</span>
            </button>

            {liveTelemetry?.sensorMode === 'simulation' &&
              (liveTelemetry.runState === 'countdown' || liveTelemetry.runState === 'armed') && (
                <button
                  type="button"
                  onClick={async () => {
                    await onSendRaceCommand('trigger_launch');
                  }}
                  className="min-h-[44px] px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-display font-bold text-base uppercase rounded-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-4 h-4" />
                  <span>GAS / LAUNCH!</span>
                </button>
              )}

            <button
              type="button"
              onClick={async () => {
                const ok = await onSendRaceCommand('reset_race');
                setRemoteNotice(
                  ok ? `Perintah reset dikirim ke ${roomId}` : 'Gagal mengirim reset'
                );
                setTimeout(() => setRemoteNotice(null), 2500);
              }}
              className="min-h-[44px] px-4 py-2 bg-[#07090E] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>
          </div>

          {remoteNotice && (
            <div className="text-xs font-mono text-emerald-400">{remoteNotice}</div>
          )}
        </div>

        {/* Live Pit Wall Monitor */}
        <div className="bg-[#0F131C] border border-slate-800/90 rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-red-500" />
              <h2 className="font-semibold text-sm text-white">
                Monitor Telemetri Live ({roomId})
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {liveTelemetry && (
                <div className="text-xs font-mono text-slate-400">
                  {liveTelemetry.vehicleName} · Target {liveTelemetry.targetDistance}m ·{' '}
                  {liveTelemetry.sensorMode === 'live' ? 'GPS+IMU' : 'Simulasi'}
                </div>
              )}
              {liveTelemetry && (
                <button
                  type="button"
                  onClick={() => {
                    setDismissedMonitorThisCycle(false);
                    setManualMonitorOpen(true);
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-600/60 text-cyan-300 rounded-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Layar Penuh</span>
                </button>
              )}
            </div>
          </div>

          {!liveTelemetry ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Menunggu aliran telemetri dari perangkat pengemudi di room{' '}
              <span className="font-mono text-white">{roomId}</span>. Mulai race di tab Cockpit
              untuk melihat siaran telemetri real-time.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-4 items-center">
              <div className="md:col-span-4 flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">
                  Kecepatan Live
                </span>
                <div className="font-mono font-bold text-4xl tabular-nums text-white">
                  {liveTelemetry.speedKmh.toFixed(1)}{' '}
                  <span className="text-base text-slate-400">km/h</span>
                </div>
                <div className="text-xs font-mono text-amber-400 tabular-nums">
                  Akselerasi: {liveTelemetry.accelG >= 0 ? '+' : ''}
                  {liveTelemetry.accelG.toFixed(2)} G · Peak {liveTelemetry.peakSpeedKmh.toFixed(1)}{' '}
                  km/h
                </div>
              </div>

              <div className="md:col-span-4 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400">
                    ET / Status Start
                  </span>
                  <ChristmasTree
                    runState={liveTelemetry.runState}
                    treeStep={liveTelemetry.treeStep}
                    launchMode="tree"
                    compact
                  />
                </div>
                <div className="font-mono font-bold text-3xl tabular-nums text-white mt-1">
                  {liveTelemetry.runState === 'redlight' ? (
                    <span className="text-red-500">RED LIGHT</span>
                  ) : (
                    `${liveTelemetry.elapsedSec.toFixed(3)}s`
                  )}
                </div>
                <div className="text-xs font-mono text-slate-400 tabular-nums">
                  RT:{' '}
                  <span className="text-emerald-400">
                    {liveTelemetry.reactionTimeSec !== null
                      ? `${liveTelemetry.reactionTimeSec.toFixed(3)}s`
                      : '--.---'}
                  </span>{' '}
                  · Jarak: {liveTelemetry.distanceM.toFixed(1)}/{liveTelemetry.targetDistance}m
                </div>
              </div>

              <div className="md:col-span-4 grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                {([20, 100, 201, 402] as const).map((d) => {
                  const sp = liveTelemetry.splits.find((s) => s.distance === d);
                  return (
                    <div
                      key={d}
                      className="bg-[#07090E] border border-slate-800/80 rounded p-2"
                    >
                      <div className="text-[10px] text-slate-500">{d}m</div>
                      <div className="text-white font-semibold">
                        {sp ? `${sp.timeSec.toFixed(3)}s` : '--.---'}
                      </div>
                      <div className="text-[11px] text-cyan-400">
                        {sp ? `${sp.speedKmh.toFixed(1)} km/h` : '--.-'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Recent Synced Runs Quick Feed */}
        <div className="bg-[#0F131C] border border-slate-800/90 rounded-lg p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-semibold text-white">
              Run Tersinkronisasi Terbaru ({runs.length})
            </div>
            <button
              type="button"
              disabled={runs.length === 0}
              onClick={() => void exportRunsPdf(runs, { vehicleLabel: 'Semua Kendaraan', roomId })}
              className="px-2.5 py-1 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export Semua Run (PDF)</span>
            </button>
          </div>
          {runs.length === 0 ? (
            <p className="text-xs text-slate-500">Belum ada run tersimpan di room {roomId}.</p>
          ) : (
            <div className="divide-y divide-slate-800/70 text-xs font-mono tabular-nums">
              {runs.slice(0, 6).map((r) => (
                <div key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-sans font-medium text-slate-200">
                    {r.vehicleName} · {r.targetDistance}m
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-slate-400">
                      RT {r.reactionTimeSec !== null ? `${r.reactionTimeSec.toFixed(3)}s` : '-'}
                    </span>
                    <span className={r.isRedLight ? 'text-red-400' : 'text-white font-semibold'}>
                      {r.isRedLight ? 'FOUL' : `${r.etSec.toFixed(3)}s`}
                    </span>
                    <span className="text-cyan-400">{r.peakSpeedKmh.toFixed(1)} km/h</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showRemoteStartOverlay && (
        <StartTreeOverlay
          runState={pendingStartOverlay && remoteRunState === 'idle' ? 'staging' : remoteRunState}
          treeStep={liveTelemetry?.treeStep ?? 0}
          reactionTimeSec={liveTelemetry?.reactionTimeSec ?? null}
          targetDistance={liveTelemetry?.targetDistance ?? remoteDistance}
          sensorMode={liveTelemetry?.sensorMode ?? 'live'}
          isPortrait={isPortrait}
          onTriggerLaunch={() => void onSendRaceCommand('trigger_launch')}
          onCancel={() => {
            setPendingStartOverlay(false);
            setDismissedThisCycle(true);
            void onSendRaceCommand('reset_race');
          }}
          onRestart={() => {
            setDismissedThisCycle(false);
            setPendingStartOverlay(true);
            setTimeout(() => setPendingStartOverlay(false), 2500);
            void onSendRaceCommand('start_tree', {
              targetDistance: remoteDistance,
              launchMode: 'tree',
            });
          }}
          onDismissOverlay={() => {
            setPendingStartOverlay(false);
            setDismissedThisCycle(true);
          }}
        />
      )}

      {showLiveMonitorOverlay && liveTelemetry && (
        <LiveMonitorOverlay
          roomId={roomId}
          telemetry={liveTelemetry}
          clientsCount={clientsCount}
          remoteDistance={remoteDistance}
          onMinimize={() => {
            setManualMonitorOpen(false);
            setDismissedMonitorThisCycle(true);
          }}
          onReset={() => {
            setManualMonitorOpen(false);
            setDismissedMonitorThisCycle(true);
            setSawRunningThisCycle(false);
            void onSendRaceCommand('reset_race');
          }}
          onRestartTree={() => {
            setManualMonitorOpen(false);
            setDismissedMonitorThisCycle(false);
            setSawRunningThisCycle(false);
            setDismissedThisCycle(false);
            if (enableBigLights) {
              setPendingStartOverlay(true);
              setTimeout(() => setPendingStartOverlay(false), 2500);
            }
            void onSendRaceCommand('start_tree', {
              targetDistance: remoteDistance,
              launchMode: 'tree',
            });
          }}
        />
      )}
    </div>
  );
}
