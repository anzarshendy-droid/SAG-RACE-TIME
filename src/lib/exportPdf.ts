import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { computeVehicleStats, formatSec, formatSpeed, getSplitValue } from './stats';
import type { DragRunRecord } from '../types/telemetry';

async function loadLogoDataUrl(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = '/assets/aistudio/file_00000000e03c820787c08bc8a32ef64e_acaedc25.png';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Logo load error'));
      setTimeout(() => reject(new Error('Logo timeout')), 2000);
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 300;
    canvas.height = img.naturalHeight || 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export async function exportRunsPdf(
  runs: DragRunRecord[],
  options: { vehicleLabel?: string; roomId?: string } = {}
): Promise<void> {
  if (runs.length === 0) return;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const stats = computeVehicleStats(runs);
  const logoDataUrl = await loadLogoDataUrl();

  // Header band
  doc.setFillColor(11, 14, 23);
  doc.rect(0, 0, pageWidth, 26, 'F');

  // Crimson accent rule under header
  doc.setFillColor(239, 68, 68);
  doc.rect(0, 26, pageWidth, 1.2, 'F');

  let textStartX = 14;
  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, 4.5, 36, 17, 1.5, 1.5, 'F');
    doc.addImage(logoDataUrl, 'PNG', 13, 5.5, 34, 15);
    textStartX = 53;
  }

  doc.setTextColor(248, 250, 252);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SAG RACE TIME — LAPORAN TELEMETRI DRAG RACE', textStartX, 12.5);

  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const nowStr = new Date().toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const roomText = options.roomId ? `Room: ${options.roomId}  ·  ` : '';
  const filterText = options.vehicleLabel ? `Unit: ${options.vehicleLabel}  ·  ` : '';
  doc.text(
    `${roomText}${filterText}Total Run: ${runs.length} (${stats.validRuns} Valid)  ·  Dicetak: ${nowStr}`,
    textStartX,
    19
  );

  // Summary KPI Strip
  const kpis = [
    {
      label: 'BEST 201M',
      val: `${formatSec(stats.best201m)} s`,
      sub: `${formatSpeed(stats.best201Trap)} km/h`,
    },
    {
      label: 'BEST 402M',
      val: `${formatSec(stats.best402m)} s`,
      sub: `${formatSpeed(stats.best402Trap)} km/h`,
    },
    {
      label: 'BEST RT',
      val: `${formatSec(stats.bestRt)} s`,
      sub: `20m: ${formatSec(stats.best20m)} s`,
    },
    {
      label: 'TOP SPEED',
      val: `${formatSpeed(stats.peakSpeed)} km/h`,
      sub: `Peak G: ${stats.peakAccelG !== null ? stats.peakAccelG.toFixed(2) : '--'} G`,
    },
    {
      label: 'KONSISTENSI / WHP',
      val: stats.consistencyStdDev !== null ? `±${stats.consistencyStdDev.toFixed(3)} s` : '--',
      sub: stats.peakEstWhp ? `Est. ${stats.peakEstWhp} WHP` : 'Est. -- WHP',
    },
  ];

  const cardGap = 3;
  const marginX = 12;
  const usableW = pageWidth - marginX * 2;
  const cardW = (usableW - cardGap * (kpis.length - 1)) / kpis.length;
  const cardY = 31;

  kpis.forEach((k, i) => {
    const x = marginX + i * (cardW + cardGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, cardY, cardW, 17, 1.5, 1.5, 'FD');

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(k.label, x + 3, cardY + 5);

    doc.setTextColor(15, 23, 42);
    doc.setFont('courier', 'bold');
    doc.setFontSize(11);
    doc.text(k.val, x + 3, cardY + 10.5);

    doc.setTextColor(71, 85, 105);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.text(k.sub, x + 3, cardY + 14.8);
  });

  // Detailed Runs Table
  const tableRows = runs.map((r, idx) => {
    const s20 = getSplitValue(r, 20);
    const s100 = getSplitValue(r, 100);
    const s201 = getSplitValue(r, 201);
    const s402 = getSplitValue(r, 402);
    const timeStr = new Date(r.createdAt).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return [
      String(idx + 1),
      timeStr,
      r.vehicleName,
      `${r.targetDistance}m`,
      r.sensorMode === 'live' ? 'GPS+IMU' : 'Sim',
      r.isRedLight
        ? 'FOUL'
        : r.reactionTimeSec !== null
          ? `${r.reactionTimeSec.toFixed(3)}s`
          : 'Roll',
      s20 ? `${s20.timeSec.toFixed(3)}s (${s20.speedKmh.toFixed(0)})` : '-',
      s100 ? `${s100.timeSec.toFixed(3)}s (${s100.speedKmh.toFixed(0)})` : '-',
      s201 ? `${s201.timeSec.toFixed(3)}s (${s201.speedKmh.toFixed(1)})` : '-',
      s402 ? `${s402.timeSec.toFixed(3)}s (${s402.speedKmh.toFixed(1)})` : '-',
      r.isRedLight ? 'RED LIGHT' : `${r.etSec.toFixed(3)}s`,
      `${r.peakSpeedKmh.toFixed(1)}`,
      `${r.peakAccelG.toFixed(2)}G`,
      r.zeroTo100Sec !== null ? `${r.zeroTo100Sec.toFixed(2)}s` : '-',
      r.estimatedWhp !== null ? `${r.estimatedWhp}` : '-',
    ];
  });

  autoTable(doc, {
    startY: 52,
    margin: { left: 12, right: 12, bottom: 14 },
    head: [
      [
        '#',
        'Waktu',
        'Kendaraan',
        'Kelas',
        'Sensor',
        'RT',
        '20m (km/h)',
        '100m (km/h)',
        '201m (km/h)',
        '402m (km/h)',
        'ET Final',
        'Peak km/h',
        'Peak G',
        '0-100',
        'WHP',
      ],
    ],
    body: tableRows,
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [15, 19, 28],
      textColor: [248, 250, 252],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      3: { halign: 'center', cellWidth: 13 },
      4: { halign: 'center', cellWidth: 15 },
      5: { halign: 'right', font: 'courier' },
      6: { halign: 'right', font: 'courier' },
      7: { halign: 'right', font: 'courier' },
      8: { halign: 'right', font: 'courier' },
      9: { halign: 'right', font: 'courier' },
      10: { halign: 'right', font: 'courier', fontStyle: 'bold' },
      11: { halign: 'right', font: 'courier', fontStyle: 'bold' },
      12: { halign: 'right', font: 'courier' },
      13: { halign: 'right', font: 'courier' },
      14: { halign: 'right', font: 'courier' },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const val = String(data.cell.raw ?? '');
        if (val === 'FOUL' || val === 'RED LIGHT') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      const currentPage = doc.getCurrentPageInfo().pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `SAG Race Time · Laporan Telemetri Drag 201m & 402m`,
        12,
        pageHeight - 6
      );
      doc.text(
        `Halaman ${currentPage} / ${pageCount}`,
        pageWidth - 12,
        pageHeight - 6,
        { align: 'right' }
      );
    },
  });

  const dateSlug = new Date().toISOString().slice(0, 10);
  doc.save(`SAG-Race-Time-Runs-${dateSlug}.pdf`);
}
