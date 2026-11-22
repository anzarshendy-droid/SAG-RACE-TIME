import type { DragRunRecord, RaceDistance, SplitDistance } from '../types/telemetry';

export interface VehicleStatsSummary {
  totalRuns: number;
  validRuns: number;
  bestRt: number | null;
  best20m: number | null;
  best100m: number | null;
  best201m: number | null;
  best201Trap: number | null;
  best402m: number | null;
  best402Trap: number | null;
  peakSpeed: number | null;
  peakAccelG: number | null;
  best0To60: number | null;
  best0To100: number | null;
  avgEt201: number | null;
  avgEt402: number | null;
  consistencyStdDev: number | null;
  peakEstWhp: number | null;
}

export function getSplitValue(run: DragRunRecord, distance: SplitDistance) {
  return run.splits.find((s) => s.distance === distance) ?? null;
}

export function estimateWhpFromRun(
  weightKg: number,
  trapSpeedKmh: number,
  targetDistance: RaceDistance
): number | null {
  if (!weightKg || weightKg <= 0 || trapSpeedKmh <= 10) return null;
  const weightLbs = weightKg * 2.20462;
  // Convert 201m trap speed to approximate 402m equivalent mph (approx +24% trap gain)
  const trapMph = trapSpeedKmh * 0.621371;
  const quarterMph = targetDistance === 402 ? trapMph : trapMph * 1.24;
  const whp = weightLbs * Math.pow(quarterMph / 234, 3);
  return Math.round(whp * 10) / 10;
}

export function computeVehicleStats(
  runs: DragRunRecord[],
  vehicleId?: string
): VehicleStatsSummary {
  const filtered = vehicleId ? runs.filter((r) => r.vehicleId === vehicleId) : runs;
  const valid = filtered.filter((r) => !r.isRedLight);

  const minVal = (arr: Array<number | null | undefined>): number | null => {
    const nums = arr.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return nums.length > 0 ? Math.min(...nums) : null;
  };

  const maxVal = (arr: Array<number | null | undefined>): number | null => {
    const nums = arr.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return nums.length > 0 ? Math.max(...nums) : null;
  };

  const avg = (arr: number[]): number | null => {
    if (arr.length === 0) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };

  const et201s = valid
    .map((r) => (r.targetDistance === 201 ? r.etSec : getSplitValue(r, 201)?.timeSec ?? null))
    .filter((v): v is number => v !== null);

  const et402s = valid
    .filter((r) => r.targetDistance === 402)
    .map((r) => r.etSec);

  const primarySeries = et201s.length >= 2 ? et201s : et402s;
  let consistencyStdDev: number | null = null;
  if (primarySeries.length >= 2) {
    const mean = primarySeries.reduce((a, b) => a + b, 0) / primarySeries.length;
    const variance =
      primarySeries.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / primarySeries.length;
    consistencyStdDev = Math.sqrt(variance);
  }

  return {
    totalRuns: filtered.length,
    validRuns: valid.length,
    bestRt: minVal(valid.map((r) => r.reactionTimeSec)),
    best20m: minVal(valid.map((r) => getSplitValue(r, 20)?.timeSec)),
    best100m: minVal(valid.map((r) => getSplitValue(r, 100)?.timeSec)),
    best201m: minVal(et201s),
    best201Trap: maxVal(valid.map((r) => getSplitValue(r, 201)?.speedKmh)),
    best402m: minVal(et402s),
    best402Trap: maxVal(valid.map((r) => getSplitValue(r, 402)?.speedKmh)),
    peakSpeed: maxVal(valid.map((r) => r.peakSpeedKmh)),
    peakAccelG: maxVal(valid.map((r) => r.peakAccelG)),
    best0To60: minVal(valid.map((r) => r.zeroTo60Sec)),
    best0To100: minVal(valid.map((r) => r.zeroTo100Sec)),
    avgEt201: avg(et201s),
    avgEt402: avg(et402s),
    consistencyStdDev,
    peakEstWhp: maxVal(valid.map((r) => r.estimatedWhp)),
  };
}

export function formatSec(val: number | null | undefined, digits = 3): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '--.---';
  return val.toFixed(digits);
}

export function formatSpeed(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '--.-';
  return val.toFixed(1);
}

export function exportRunsCsv(runs: DragRunRecord[]): void {
  const headers = [
    'ID',
    'Tanggal',
    'Kendaraan',
    'Jarak_Target_m',
    'Mode_Start',
    'Mode_Sensor',
    'RT_s',
    'Red_Light',
    'Split_20m_s',
    'Speed_20m_kmh',
    'Split_100m_s',
    'Speed_100m_kmh',
    'Split_201m_s',
    'Speed_201m_kmh',
    'Split_402m_s',
    'Speed_402m_kmh',
    'ET_Final_s',
    'Peak_Speed_kmh',
    'Peak_G',
    '0_60_kmh_s',
    '0_100_kmh_s',
    'Est_WHP',
  ];

  const rows = runs.map((r) => {
    const s20 = getSplitValue(r, 20);
    const s100 = getSplitValue(r, 100);
    const s201 = getSplitValue(r, 201);
    const s402 = getSplitValue(r, 402);
    return [
      r.id,
      new Date(r.createdAt).toISOString(),
      `"${r.vehicleName.replace(/"/g, '""')}"`,
      r.targetDistance,
      r.launchMode,
      r.sensorMode,
      r.reactionTimeSec?.toFixed(3) ?? '',
      r.isRedLight ? 'YA' : 'TIDAK',
      s20?.timeSec.toFixed(3) ?? '',
      s20?.speedKmh.toFixed(1) ?? '',
      s100?.timeSec.toFixed(3) ?? '',
      s100?.speedKmh.toFixed(1) ?? '',
      s201?.timeSec.toFixed(3) ?? '',
      s201?.speedKmh.toFixed(1) ?? '',
      s402?.timeSec.toFixed(3) ?? '',
      s402?.speedKmh.toFixed(1) ?? '',
      r.etSec.toFixed(3),
      r.peakSpeedKmh.toFixed(1),
      r.peakAccelG.toFixed(2),
      r.zeroTo60Sec?.toFixed(2) ?? '',
      r.zeroTo100Sec?.toFixed(2) ?? '',
      r.estimatedWhp?.toFixed(1) ?? '',
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sag-race-time-runs-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
