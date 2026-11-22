import { useMemo, useState } from 'react';
import { Download, FileText, Trash2 } from 'lucide-react';
import { exportRunsPdf } from '../lib/exportPdf';
import {
  computeVehicleStats,
  exportRunsCsv,
  formatSec,
  formatSpeed,
  getSplitValue,
} from '../lib/stats';
import type { DragRunRecord, RaceDistance, VehicleProfile } from '../types/telemetry';
import { TelemetryChart } from './TelemetryChart';

interface StatsViewProps {
  runs: DragRunRecord[];
  vehicles: VehicleProfile[];
  activeVehicleId: string;
  roomId: string;
  onDeleteRun: (runId: string) => void;
  onGoToCockpit: () => void;
}

export function StatsView({
  runs,
  vehicles,
  activeVehicleId,
  roomId,
  onDeleteRun,
  onGoToCockpit,
}: StatsViewProps) {
  const [vehicleFilter, setVehicleFilter] = useState<string>(activeVehicleId || 'all');
  const [distanceFilter, setDistanceFilter] = useState<'all' | RaceDistance>('all');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      if (vehicleFilter !== 'all' && r.vehicleId !== vehicleFilter) return false;
      if (distanceFilter !== 'all' && r.targetDistance !== distanceFilter) return false;
      return true;
    });
  }, [runs, vehicleFilter, distanceFilter]);

  const stats = useMemo(
    () => computeVehicleStats(runs, vehicleFilter === 'all' ? undefined : vehicleFilter),
    [runs, vehicleFilter]
  );

  const selectedRun = useMemo(() => {
    if (filteredRuns.length === 0) return null;
    return filteredRuns.find((r) => r.id === selectedRunId) ?? filteredRuns[0];
  }, [filteredRuns, selectedRunId]);

  const pbForSelected = useMemo(() => {
    if (!selectedRun) return null;
    const candidates = runs.filter(
      (r) =>
        r.vehicleId === selectedRun.vehicleId &&
        r.targetDistance === selectedRun.targetDistance &&
        !r.isRedLight &&
        r.id !== selectedRun.id
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((best, cur) => (cur.etSec < best.etSec ? cur : best), candidates[0]);
  }, [runs, selectedRun]);

  const handleExportPdf = async () => {
    const runsToExport = filteredRuns.length > 0 ? filteredRuns : runs;
    if (runsToExport.length === 0) return;
    setIsExportingPdf(true);
    try {
      const vehName =
        vehicleFilter === 'all'
          ? 'Semua Kendaraan'
          : vehicles.find((v) => v.id === vehicleFilter)?.name ?? 'Unit';
      await exportRunsPdf(runsToExport, { vehicleLabel: vehName, roomId });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto sag-scroll bg-[#07090E] p-3 md:p-5">
      <div className="max-w-7xl mx-auto flex flex-col gap-4">
        {/* Header & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display font-bold text-2xl text-white tracking-tight">
              Statistik Performa Kendaraan
            </h1>
            <p className="text-xs text-slate-400">
              Rekap RT, split 20m / 100m / 201m / 402m, top speed, dan kurva telemetri tiap run
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter Kendaraan"
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              className="bg-[#0F131C] border border-slate-800 text-xs text-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="all">Semua Kendaraan</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>

            <div className="flex items-center bg-[#0F131C] border border-slate-800 rounded-md p-0.5">
              {(['all', 201, 402] as const).map((d) => (
                <button
                  key={String(d)}
                  type="button"
                  onClick={() => setDistanceFilter(d)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                    distanceFilter === d
                      ? 'bg-red-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {d === 'all' ? 'Semua' : `${d}m`}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={runs.length === 0 || isExportingPdf}
              onClick={() => void handleExportPdf()}
              className="px-3 py-2 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-md flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isExportingPdf ? 'Membuat PDF...' : 'Export PDF'}</span>
            </button>

            <button
              type="button"
              disabled={filteredRuns.length === 0}
              onClick={() => exportRunsCsv(filteredRuns)}
              className="px-3 py-2 text-xs font-medium bg-[#0F131C] hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-md flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Performance KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          <div className="bg-[#0F131C] border border-slate-800/90 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Best 201m ET</div>
            <div className="font-mono font-bold text-lg tabular-nums text-white mt-0.5">
              {formatSec(stats.best201m)}s
            </div>
            <div className="text-[11px] font-mono text-cyan-400">
              {formatSpeed(stats.best201Trap)} km/h
            </div>
          </div>

          <div className="bg-[#0F131C] border border-slate-800/90 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Best 402m ET</div>
            <div className="font-mono font-bold text-lg tabular-nums text-white mt-0.5">
              {formatSec(stats.best402m)}s
            </div>
            <div className="text-[11px] font-mono text-cyan-400">
              {formatSpeed(stats.best402Trap)} km/h
            </div>
          </div>

          <div className="bg-[#0F131C] border border-slate-800/90 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Best RT</div>
            <div className="font-mono font-bold text-lg tabular-nums text-emerald-400 mt-0.5">
              {formatSec(stats.bestRt)}s
            </div>
            <div className="text-[11px] text-slate-500">Reaction Time</div>
          </div>

          <div className="bg-[#0F131C] border border-slate-800/90 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Best 20m</div>
            <div className="font-mono font-bold text-lg tabular-nums text-white mt-0.5">
              {formatSec(stats.best20m)}s
            </div>
            <div className="text-[11px] text-slate-500">Launch Split</div>
          </div>

          <div className="bg-[#0F131C] border border-slate-800/90 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Best 100m</div>
            <div className="font-mono font-bold text-lg tabular-nums text-white mt-0.5">
              {formatSec(stats.best100m)}s
            </div>
            <div className="text-[11px] text-slate-500">Mid Track</div>
          </div>

          <div className="bg-[#0F131C] border border-slate-800/90 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Top Speed</div>
            <div className="font-mono font-bold text-lg tabular-nums text-cyan-400 mt-0.5">
              {formatSpeed(stats.peakSpeed)}
            </div>
            <div className="text-[11px] text-slate-500">km/h Peak</div>
          </div>

          <div className="bg-[#0F131C] border border-slate-800/90 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Peak G / WHP</div>
            <div className="font-mono font-bold text-lg tabular-nums text-amber-400 mt-0.5">
              {stats.peakAccelG !== null ? `${stats.peakAccelG.toFixed(2)}G` : '--'}
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              {stats.peakEstWhp ? `${stats.peakEstWhp} WHP` : '-- WHP'}
            </div>
          </div>

          <div className="bg-[#0F131C] border border-slate-800/90 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Konsistensi</div>
            <div className="font-mono font-bold text-lg tabular-nums text-white mt-0.5">
              {stats.consistencyStdDev !== null
                ? `±${stats.consistencyStdDev.toFixed(3)}s`
                : '--'}
            </div>
            <div className="text-[11px] text-slate-500">
              {stats.validRuns}/{stats.totalRuns} Run Valid
            </div>
          </div>
        </div>

        {/* Empty State or Split Inspector + Runs Table */}
        {filteredRuns.length === 0 ? (
          <div className="bg-[#0F131C] border border-slate-800/90 rounded-lg p-10 text-center flex flex-col items-center justify-center gap-3">
            <p className="text-sm font-medium text-slate-200">
              Belum ada data run terekam untuk filter ini
            </p>
            <p className="text-xs text-slate-400 max-w-md">
              Jalankan drag race melalui GPS + Akselerometer atau gunakan Mode Simulasi di Cockpit
              untuk merekam RT, split jarak 20/100/201/402m, dan grafik telemetri.
            </p>
            <button
              type="button"
              onClick={onGoToCockpit}
              className="px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-md cursor-pointer"
            >
              Buka Cockpit Race
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Selected Run Telemetry Inspector */}
            {selectedRun && (
              <div className="lg:col-span-5 bg-[#0F131C] border border-slate-800/90 rounded-lg p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-800">
                  <div>
                    <div className="text-xs text-slate-400">
                      {selectedRun.vehicleName} · {selectedRun.targetDistance}m ·{' '}
                      {selectedRun.sensorMode === 'live' ? 'GPS+IMU' : 'Simulasi'}
                    </div>
                    <div className="font-mono font-bold text-2xl tabular-nums text-white mt-0.5">
                      {selectedRun.isRedLight ? (
                        <span className="text-red-500">RED LIGHT FOUL</span>
                      ) : (
                        <>
                          {selectedRun.etSec.toFixed(3)}s{' '}
                          <span className="text-sm font-normal text-cyan-400">
                            @ {selectedRun.trapSpeedKmh.toFixed(1)} km/h
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteRun(selectedRun.id)}
                    aria-label="Hapus Run"
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800/70 rounded-md cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Chart */}
                <div className="h-56 bg-[#07090E] border border-slate-800/80 rounded-md p-2">
                  <TelemetryChart
                    samples={selectedRun.samples}
                    pbSamples={pbForSelected?.samples}
                    splits={selectedRun.splits}
                    targetDistance={selectedRun.targetDistance}
                    interactive
                    heightClass="h-full"
                  />
                </div>

                {/* Split Breakdown */}
                <div className="grid grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                  {([20, 100, 201, 402] as const).map((dist) => {
                    const sp = getSplitValue(selectedRun, dist);
                    return (
                      <div
                        key={dist}
                        className={`bg-[#07090E] border border-slate-800/80 rounded p-2 ${
                          !sp ? 'opacity-40' : ''
                        }`}
                      >
                        <div className="text-[10px] text-slate-400">{dist}m</div>
                        <div className="text-white font-semibold mt-0.5">
                          {sp ? `${sp.timeSec.toFixed(3)}s` : '--.---'}
                        </div>
                        <div className="text-[11px] text-cyan-400">
                          {sp ? `${sp.speedKmh.toFixed(1)} km/h` : '--.-'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-400 pt-1 border-t border-slate-800/80">
                  <span>
                    RT:{' '}
                    <strong className="text-slate-200">
                      {selectedRun.reactionTimeSec !== null
                        ? `${selectedRun.reactionTimeSec.toFixed(3)}s`
                        : 'Rollout'}
                    </strong>
                  </span>
                  <span>
                    0-60:{' '}
                    <strong className="text-slate-200">
                      {selectedRun.zeroTo60Sec ? `${selectedRun.zeroTo60Sec.toFixed(2)}s` : '--'}
                    </strong>
                  </span>
                  <span>
                    0-100:{' '}
                    <strong className="text-slate-200">
                      {selectedRun.zeroTo100Sec ? `${selectedRun.zeroTo100Sec.toFixed(2)}s` : '--'}
                    </strong>
                  </span>
                  <span>
                    Peak G:{' '}
                    <strong className="text-amber-400">
                      {selectedRun.peakAccelG.toFixed(2)}G
                    </strong>
                  </span>
                </div>
              </div>
            )}

            {/* Run History Table */}
            <div className="lg:col-span-7 bg-[#0F131C] border border-slate-800/90 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider bg-[#0A0D14]">
                      <th className="py-2.5 px-3 font-medium">Waktu / Unit</th>
                      <th className="py-2.5 px-2 font-medium text-right">RT</th>
                      <th className="py-2.5 px-2 font-medium text-right">20m</th>
                      <th className="py-2.5 px-2 font-medium text-right">100m</th>
                      <th className="py-2.5 px-2 font-medium text-right">201m</th>
                      <th className="py-2.5 px-2 font-medium text-right">402m</th>
                      <th className="py-2.5 px-3 font-medium text-right">Top km/h</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                    {filteredRuns.map((run) => {
                      const isSelected = selectedRun?.id === run.id;
                      const s20 = getSplitValue(run, 20);
                      const s100 = getSplitValue(run, 100);
                      const s201 = getSplitValue(run, 201);
                      const s402 = getSplitValue(run, 402);
                      return (
                        <tr
                          key={run.id}
                          onClick={() => setSelectedRunId(run.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-red-950/30 text-white'
                              : 'hover:bg-slate-800/40 text-slate-300'
                          }`}
                        >
                          <td className="py-2.5 px-3 font-sans">
                            <div className="font-medium text-slate-100 truncate max-w-[150px]">
                              {run.vehicleName}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {new Date(run.createdAt).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              · {run.targetDistance}m ·{' '}
                              {run.sensorMode === 'live' ? 'GPS' : 'Sim'}
                            </div>
                          </td>
                          <td
                            className={`py-2.5 px-2 text-right ${
                              run.isRedLight ? 'text-red-400 font-semibold' : 'text-emerald-400'
                            }`}
                          >
                            {run.isRedLight
                              ? 'FOUL'
                              : run.reactionTimeSec !== null
                                ? run.reactionTimeSec.toFixed(3)
                                : '-'}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {s20 ? s20.timeSec.toFixed(3) : '-'}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {s100 ? s100.timeSec.toFixed(3) : '-'}
                          </td>
                          <td className="py-2.5 px-2 text-right font-semibold text-white">
                            {s201 ? s201.timeSec.toFixed(3) : '-'}
                          </td>
                          <td className="py-2.5 px-2 text-right font-semibold text-white">
                            {s402 ? s402.timeSec.toFixed(3) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-cyan-400 font-semibold">
                            {run.peakSpeedKmh.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
