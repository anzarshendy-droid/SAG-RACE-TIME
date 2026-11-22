import { useState } from 'react';
import { Check, Copy, Download, FileText, Radio, RefreshCw, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { SyncConnectionState, SyncTransportMode } from '../hooks/useRealtimeSync';
import { exportRunsPdf } from '../lib/exportPdf';
import type { DragRunRecord, LiveTelemetryPayload } from '../types/telemetry';
import { ChristmasTree } from './ChristmasTree';

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
}: PitSyncViewProps) {
  const [roomInput, setRoomInput] = useState(roomId);
  const [copied, setCopied] = useState(false);
  const [copiedAppUrl, setCopiedAppUrl] = useState(false);
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const appRootUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/` : '';

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}&tab=sync`
      : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
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

          <div className="md:col-span-6 bg-[#0F131C] border border-slate-800/90 rounded-lg p-4 flex flex-col justify-between gap-3">
            <div className="text-xs font-semibold text-white">Bagikan Link Monitor Pit Crew</div>
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
            <p className="text-[11px] text-slate-500">
              Buka link ini di laptop atau tablet lain untuk memantau run pengemudi secara live.
            </p>
          </div>
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
            {liveTelemetry && (
              <div className="text-xs font-mono text-slate-400">
                {liveTelemetry.vehicleName} · Target {liveTelemetry.targetDistance}m ·{' '}
                {liveTelemetry.sensorMode === 'live' ? 'GPS+IMU' : 'Simulasi'}
              </div>
            )}
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
        {/* Install Android / iOS App & Build APK Card */}
        <div className="bg-[#0F131C] border border-slate-800/90 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <h2 className="font-semibold text-sm text-white">
                Install Aplikasi HP &amp; Paket Android (.APK)
              </h2>
            </div>
            {isInstallable && !isInstalled && (
              <button
                type="button"
                onClick={() => void install()}
                className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install Langsung ke HP</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300 leading-relaxed">
            <div className="bg-[#07090E] border border-slate-800/80 rounded-md p-3">
              <div className="font-semibold text-white mb-1">1. Install Langsung (Tanpa Play Store)</div>
              <p className="text-slate-400">
                Buka aplikasi di Chrome Android, lalu klik tombol{' '}
                <strong className="text-slate-200">Install App</strong> di kanan atas atau menu
                Chrome (<strong className="text-slate-200">Add to Home screen / Install app</strong>
                ). Aplikasi akan terpasang dengan ikon SAG Race Time dan berjalan fullscreen offline.
              </p>
            </div>

            <div className="bg-[#07090E] border border-slate-800/80 rounded-md p-3 flex flex-col justify-between gap-2">
              <div>
                <div className="font-semibold text-white mb-1">2. Generate File .APK (PWABuilder)</div>
                <p className="text-slate-400">
                  Salin URL aplikasi di bawah, tempel ke{' '}
                  <span className="font-mono text-cyan-400">pwabuilder.com</span>, lalu pilih{' '}
                  <strong className="text-slate-200">Package for Stores → Android</strong> untuk
                  mengunduh file <span className="font-mono text-white">.apk</span> siap install.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={appRootUrl}
                  aria-label="URL Aplikasi PWA"
                  className="flex-1 bg-[#0F131C] border border-slate-800 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-300 select-all"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(appRootUrl);
                      setCopiedAppUrl(true);
                      setTimeout(() => setCopiedAppUrl(false), 2000);
                    } catch {
                      // ignore
                    }
                  }}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-[11px] font-medium rounded flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copiedAppUrl ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedAppUrl ? 'Tersalin' : 'Salin URL'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
