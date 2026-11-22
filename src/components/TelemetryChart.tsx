import { useEffect, useMemo, useRef, useState } from 'react';
import type { SplitRecord, TelemetrySample } from '../types/telemetry';

interface TelemetryChartProps {
  samples: TelemetrySample[];
  pbSamples?: TelemetrySample[];
  splits?: SplitRecord[];
  targetDistance: 201 | 402;
  interactive?: boolean;
  heightClass?: string;
}

export function TelemetryChart({
  samples,
  pbSamples,
  splits = [],
  targetDistance,
  interactive = true,
  heightClass = 'h-full',
}: TelemetryChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 420, height: 220 });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.floor(entry.contentRect.height);
        if (w > 20 && h > 20) {
          setSize({ width: w, height: h });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bounds = useMemo(() => {
    const allSamples = [...samples, ...(pbSamples ?? [])];
    const maxTime = Math.max(
      targetDistance === 201 ? 6.5 : 10.5,
      ...allSamples.map((s) => s.t)
    );
    const rawMaxSpeed = Math.max(100, ...allSamples.map((s) => s.speedKmh));
    const maxSpeed = Math.ceil(rawMaxSpeed / 20) * 20;
    const maxG = Math.max(1.2, ...allSamples.map((s) => Math.abs(s.accelG) + 0.15));
    const minG = -0.4;
    return { maxTime, maxSpeed, maxG, minG };
  }, [samples, pbSamples, targetDistance]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const w = size.width;
    const h = size.height;
    const pad = { top: 14, right: 34, bottom: 22, left: 36 };
    const plotW = Math.max(20, w - pad.left - pad.right);
    const plotH = Math.max(20, h - pad.top - pad.bottom);

    ctx.clearRect(0, 0, w, h);

    const xOfT = (t: number) => pad.left + (t / bounds.maxTime) * plotW;
    const yOfSpeed = (kmh: number) =>
      pad.top + plotH - (Math.max(0, kmh) / bounds.maxSpeed) * plotH;
    const yOfG = (g: number) =>
      pad.top + plotH - ((g - bounds.minG) / (bounds.maxG - bounds.minG)) * plotH;

    // Horizontal grid lines (Speed)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748B';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const speedSteps = 4;
    for (let i = 0; i <= speedSteps; i++) {
      const val = (bounds.maxSpeed / speedSteps) * i;
      const y = yOfSpeed(val);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillText(`${Math.round(val)}`, pad.left - 5, y);
    }

    // Right axis G labels
    ctx.textAlign = 'left';
    ctx.fillStyle = '#B45309';
    [0, 0.5, 1.0].forEach((gTick) => {
      if (gTick <= bounds.maxG) {
        const y = yOfG(gTick);
        ctx.fillText(`${gTick.toFixed(1)}G`, w - pad.right + 4, y);
      }
    });

    // Zero G baseline
    const yZeroG = yOfG(0);
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
    ctx.beginPath();
    ctx.moveTo(pad.left, yZeroG);
    ctx.lineTo(w - pad.right, yZeroG);
    ctx.stroke();
    ctx.restore();

    // Time X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#64748B';
    const timeStep = bounds.maxTime > 12 ? 3 : 2;
    for (let t = 0; t <= bounds.maxTime; t += timeStep) {
      const x = xOfT(t);
      ctx.fillText(`${t}s`, x, h - pad.bottom + 5);
    }

    // Split vertical markers (20m, 100m, 201m, 402m) with horizontal collision staggering
    let lastLabelX = -999;
    splits.forEach((sp, idx) => {
      const x = xOfT(sp.timeSec);
      if (x >= pad.left && x <= w - pad.right) {
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, h - pad.bottom);
        ctx.stroke();
        ctx.restore();

        const clampedX = Math.max(pad.left + 14, Math.min(w - pad.right - 14, x));
        const staggerY = clampedX - lastLabelX < 28 && idx % 2 === 1 ? pad.top + 9 : pad.top - 1;
        lastLabelX = clampedX;

        ctx.fillStyle = '#F87171';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${sp.distance}m`, clampedX, staggerY);
      }
    });

    // PB Ghost Speed curve
    if (pbSamples && pbSamples.length > 1) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pbSamples.forEach((p, idx) => {
        const x = xOfT(p.t);
        const y = yOfSpeed(p.speedKmh);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }

    // Current / Selected Run Speed Curve + Area
    if (samples.length > 1) {
      const grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
      grad.addColorStop(0, 'rgba(6, 182, 212, 0.28)');
      grad.addColorStop(1, 'rgba(6, 182, 212, 0.01)');

      ctx.beginPath();
      samples.forEach((p, idx) => {
        const x = xOfT(p.t);
        const y = yOfSpeed(p.speedKmh);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(xOfT(samples[samples.length - 1].t), h - pad.bottom);
      ctx.lineTo(xOfT(samples[0].t), h - pad.bottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Speed solid line
      ctx.beginPath();
      samples.forEach((p, idx) => {
        const x = xOfT(p.t);
        const y = yOfSpeed(p.speedKmh);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Acceleration G-Force solid line
      ctx.beginPath();
      samples.forEach((p, idx) => {
        const x = xOfT(p.t);
        const y = yOfG(p.accelG);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.75;
      ctx.stroke();
    }

    // Hover Crosshair
    if (hoverIdx !== null && samples[hoverIdx]) {
      const pt = samples[hoverIdx];
      const cx = xOfT(pt.t);
      const cySpeed = yOfSpeed(pt.speedKmh);
      const cyG = yOfG(pt.accelG);

      ctx.save();
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, pad.top);
      ctx.lineTo(cx, h - pad.bottom);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#06B6D4';
      ctx.beginPath();
      ctx.arc(cx, cySpeed, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(cx, cyG, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [size, samples, pbSamples, splits, bounds, hoverIdx]);

  const hoveredSample = hoverIdx !== null ? samples[hoverIdx] : null;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || samples.length < 2 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const padLeft = 36;
    const padRight = 34;
    const plotW = Math.max(20, rect.width - padLeft - padRight);
    const relX = e.clientX - rect.left - padLeft;
    const t = Math.max(0, Math.min(bounds.maxTime, (relX / plotW) * bounds.maxTime));

    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const d = Math.abs(samples[i].t - t);
      if (d < bestDiff) {
        bestDiff = d;
        bestIdx = i;
      }
    }
    setHoverIdx(bestIdx);
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverIdx(null)}
      className={`relative w-full ${heightClass} min-h-[64px] select-none overflow-hidden ${
        interactive && samples.length > 1 ? 'cursor-crosshair' : ''
      }`}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {samples.length === 0 && (
        <div className="absolute inset-x-10 inset-y-4 flex items-center justify-center pointer-events-none">
          <div className="bg-[#0F131C]/90 border border-slate-800/80 rounded-md px-3 py-2 text-center max-w-[240px]">
            <p className="text-[11px] font-medium text-slate-300 leading-snug">
              Belum ada data kurva
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
              Mulai race atau Simulasi untuk melihat grafik km/h &amp; G-Force
            </p>
          </div>
        </div>
      )}

      {hoveredSample && (
        <div className="absolute top-1 left-10 max-w-[calc(100%-5rem)] truncate bg-[#07090E]/95 border border-slate-700/80 rounded px-2 py-0.5 text-[10px] font-mono tabular-nums text-slate-200 pointer-events-none flex items-center gap-2 z-10">
          <span>{hoveredSample.t.toFixed(2)}s</span>
          <span className="text-cyan-400">{hoveredSample.speedKmh.toFixed(1)} km/h</span>
          <span className="text-amber-400">{hoveredSample.accelG.toFixed(2)}G</span>
          <span className="text-slate-400">{hoveredSample.distanceM.toFixed(0)}m</span>
        </div>
      )}
    </div>
  );
}
