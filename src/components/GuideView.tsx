import { useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Compass,
  Crosshair,
  FileText,
  Flag,
  Gauge,
  HelpCircle,
  Radio,
  ShieldAlert,
  Smartphone,
  Wrench,
  Zap,
} from 'lucide-react';

interface GuideViewProps {
  onBackToCockpit?: () => void;
  onGoToSync?: () => void;
  onGoToGarage?: () => void;
  backLabel?: string;
}

type GuideSectionId =
  | 'all'
  | 'room'
  | 'sensor'
  | 'race'
  | 'starter'
  | 'data'
  | 'trouble';

const SECTION_TABS: Array<{ id: GuideSectionId; label: string }> = [
  { id: 'all', label: 'Semua Panduan' },
  { id: 'room', label: '1. Kode Room & 2 HP' },
  { id: 'sensor', label: '2. Sensor & 0G' },
  { id: 'race', label: '3. Cara Start Race' },
  { id: 'starter', label: '4. HP 2 & Lampu Besar' },
  { id: 'data', label: '5. Garasi, Hasil & PDF' },
  { id: 'trouble', label: '6. Tips & Solusi' },
];

export function GuideView({
  onBackToCockpit,
  onGoToSync,
  onGoToGarage,
  backLabel = 'Kembali ke Cockpit',
}: GuideViewProps) {
  const [section, setSection] = useState<GuideSectionId>('all');

  const show = (id: GuideSectionId) => section === 'all' || section === id;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto sag-scroll bg-[#07090E] p-3 md:p-5">
      <div className="max-w-5xl mx-auto flex flex-col gap-4 pb-8">
        {/* Header */}
        <div className="bg-[#0F131C] border border-slate-800/90 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-600/15 border border-red-500/40 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl sm:text-2xl text-white tracking-tight">
                Panduan Lengkap Pemakaian SAG Race Time
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Ikuti langkah berurutan dari persiapan awal, kalibrasi 0G, cara start 201m / 402m,
                hingga kontrol Lampu Besar dari HP kedua.
              </p>
            </div>
          </div>

          {onBackToCockpit && (
            <button
              type="button"
              onClick={onBackToCockpit}
              className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{backLabel}</span>
            </button>
          )}
        </div>

        {/* Section Filter Bar */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#0F131C] border border-slate-800/90 rounded-lg p-2">
          {SECTION_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                section === tab.id
                  ? 'bg-red-600 text-white'
                  : 'bg-[#07090E] text-slate-300 hover:text-white border border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 1. Kode Room & Menghubungkan 2 Perangkat */}
        {show('room') && (
          <section className="bg-[#0F131C] border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <h2 className="font-display font-bold text-lg text-white">
                  1. Persiapan Awal: Kode Room &amp; Koneksi 2 HP
                </h2>
              </div>
              {onGoToSync && (
                <button
                  type="button"
                  onClick={onGoToSync}
                  className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  Buka Tab Sync →
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300 leading-relaxed">
              <div className="bg-[#07090E] border border-slate-800/80 rounded-lg p-3">
                <div className="font-semibold text-white mb-1">Langkah A — Tentukan Kode Room</div>
                <p className="text-slate-400">
                  Saat aplikasi dibuka, masukkan kode room unik Anda (misal <span className="font-mono text-cyan-300">BALAP-01</span> atau klik{' '}
                  <strong className="text-slate-200">Acak Kode</strong>). Pastikan{' '}
                  <strong className="text-white">HP 1 dan HP 2 memakai kode room yang persis sama</strong>.
                </p>
              </div>
              <div className="bg-[#07090E] border border-slate-800/80 rounded-lg p-3">
                <div className="font-semibold text-white mb-1">Langkah B — Pilih Peran HP</div>
                <p className="text-slate-400">
                  <strong className="text-red-400">HP 1 (Pengemudi):</strong> Pilih{' '}
                  <em>Pengemudi (Cockpit)</em> dan pasang HP di motor/mobil.
                  <br />
                  <strong className="text-emerald-400">HP 2 (Starter / Pit):</strong> Pilih{' '}
                  <em>Starter / Lampu Besar</em> untuk mengendalikan lampu &amp; memantau live.
                </p>
              </div>
              <div className="bg-[#07090E] border border-slate-800/80 rounded-lg p-3">
                <div className="font-semibold text-white mb-1">Langkah C — Cek Status Terhubung</div>
                <p className="text-slate-400">
                  Pastikan status di Cockpit/Sync bertuliskan{' '}
                  <strong className="text-emerald-400">Terhubung Real-Time</strong>. Anda dapat
                  mengganti kode room kapan saja dengan mengetuk kotak kode room di pojok kanan
                  atas.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 2. Sensor GPS, Kalibrasi 0G & Sensitivitas */}
        {show('sensor') && (
          <section className="bg-[#0F131C] border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
              <Crosshair className="w-4 h-4 text-emerald-400" />
              <h2 className="font-display font-bold text-lg text-white">
                2. Kalibrasi 0G, GPS &amp; Pemilihan Sensitivitas (Wajib Sebelum Jalan)
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300 leading-relaxed">
              <div className="bg-[#07090E] border border-slate-800/80 rounded-lg p-3.5 flex flex-col gap-2">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Pemasangan HP &amp; Kunci GPS</span>
                </div>
                <ul className="space-y-1.5 text-slate-400 list-disc pl-4">
                  <li>
                    Pasang HP dengan holder yang kokoh di stang atau dashboard. Posisi HP boleh
                    tegak (Portrait) maupun tidur (Landscape), menghadap ke depan maupun ke
                    pengendara.
                  </li>
                  <li>
                    Pastikan berada di ruang terbuka (outdoor) dan tunggu indikator GPS berubah
                    menjadi stabil (<span className="font-mono text-cyan-300">GPS ±5m–15m</span>).
                  </li>
                  <li>
                    Pilih mode <strong className="text-cyan-300">GPS+IMU</strong> untuk pengetesan
                    asli di lintasan, atau <strong className="text-amber-300">Simulasi</strong> jika
                    hanya ingin latihan lampu start di dalam ruangan.
                  </li>
                </ul>
              </div>

              <div className="bg-[#07090E] border border-slate-800/80 rounded-lg p-3.5 flex flex-col gap-2">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Cara Kalibrasi 0G &amp; Pilih Sensitivitas</span>
                </div>
                <ul className="space-y-1.5 text-slate-400 list-disc pl-4">
                  <li>
                    Posisikan motor/mobil <strong className="text-white">diam total</strong> di
                    garis start dengan mesin menyala normal.
                  </li>
                  <li>
                    Tekan tombol <strong className="text-white">Kalibrasi / 0G</strong> lalu diam
                    selama ±1 detik hingga tombol berubah hijau. Ini mengenolkan sudut kemiringan
                    holder dan getaran dasar mesin.
                  </li>
                  <li>
                    Ketuk tombol level sensitivitas untuk menyesuaikan jenis kendaraan:
                    <div className="mt-1 space-y-1 text-[11px]">
                      <div>
                        • <strong className="text-white">Normal</strong> <em>(default)</em>: pas
                        untuk motor harian &amp; mobil (<span className="font-mono">0.12G</span>).
                      </div>
                      <div>
                        • <strong className="text-amber-300">Sensitif</strong>: tarikan halus /
                        pengetesan pelan (<span className="font-mono">0.07G</span>).
                      </div>
                      <div>
                        • <strong className="text-emerald-300">Anti-Getar</strong>: untuk motor
                        2-tak/racing dengan getaran stang tinggi (<span className="font-mono">0.20G</span>).
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* 3. Cara Start Race (201m / 402m) */}
        {show('race') && (
          <section className="bg-[#0F131C] border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
              <Gauge className="w-4 h-4 text-red-400" />
              <h2 className="font-display font-bold text-lg text-white">
                3. Cara Menjalankan Race (Mode Tree+RT vs Rollout)
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300 leading-relaxed">
              <div className="bg-[#07090E] border border-slate-800/80 rounded-lg p-3.5">
                <div className="font-semibold text-amber-300 mb-1.5">
                  A. Mode Tree+RT (Pakai Lampu Start &amp; Hitung Reaction Time)
                </div>
                <ol className="space-y-1.5 text-slate-400 list-decimal pl-4">
                  <li>
                    Pilih jarak <strong className="text-white">201m</strong> atau{' '}
                    <strong className="text-white">402m</strong> di toolbar atas Cockpit.
                  </li>
                  <li>
                    Pilih <strong className="text-white">Tree+RT</strong> lalu tekan{' '}
                    <strong className="text-red-400">START RACE</strong> (atau tunggu starter dari
                    HP 2 menekan <em>Start Lampu</em>).
                  </li>
                  <li>
                    Lampu besar akan menyala berurutan: <strong className="text-amber-300">PRE/STG → 1 → 2 → 3 → </strong>
                    <strong className="text-emerald-400">GO! (Hijau)</strong>.
                  </li>
                  <li>
                    <strong className="text-red-400">Waspada Jump Start!</strong> Jika kendaraan
                    bergerak saat lampu masih kuning (sebelum Hijau), hasil tercatat{' '}
                    <strong className="text-red-400">RED LIGHT (FOUL)</strong>.
                  </li>
                  <li>
                    Begitu lampu berubah <strong className="text-emerald-400">HIJAU</strong>,
                    langsung tarik gas! Waktu reaksi (<strong>RT</strong>) dan timer <strong>ET</strong>{' '}
                    otomatis berjalan sampai finish 201m / 402m.
                  </li>
                </ol>
              </div>

              <div className="bg-[#07090E] border border-slate-800/80 rounded-lg p-3.5 flex flex-col justify-between gap-2">
                <div>
                  <div className="font-semibold text-emerald-300 mb-1.5">
                    B. Mode Rollout (Auto-Start Saat Kendaraan Jalan)
                  </div>
                  <ol className="space-y-1.5 text-slate-400 list-decimal pl-4">
                    <li>
                      Pilih <strong className="text-white">Rollout</strong> di toolbar Cockpit lalu
                      tekan <strong className="text-red-400">START RACE</strong> (tanpa lampu kuning).
                    </li>
                    <li>
                      Layar berstatus <strong className="text-amber-300">SIAP LAUNCH</strong>. Anda
                      bebas kapan saja menarik gas sesuai kesiapan sendiri.
                    </li>
                    <li>
                      Timer otomatis mulai saat sensor mendeteksi dorongan launch, dan otomatis
                      berhenti serta menyimpan hasil saat menembus jarak target (201m atau 402m).
                    </li>
                  </ol>
                </div>

                <div className="bg-[#0F131C] border border-amber-700/40 rounded-md p-2.5 text-[11px] text-amber-200 flex items-start gap-2">
                  <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Mode Simulasi:</strong> Saat lampu menyala, ketuk tombol{' '}
                    <strong>GAS / LAUNCH!</strong> di layar atau tekan tombol <strong>Spasi</strong>{' '}
                    untuk mengetes run tanpa bergerak.
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 4. Perangkat Kedua (Starter & Lampu Besar) */}
        {show('starter') && (
          <section className="bg-[#0F131C] border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
              <Flag className="w-4 h-4 text-emerald-400" />
              <h2 className="font-display font-bold text-lg text-white">
                4. Menggunakan HP Kedua (Starter &amp; Lampu Start Besar)
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300 leading-relaxed">
              <div className="bg-[#07090E] border border-slate-800/80 rounded-lg p-3.5">
                <div className="font-semibold text-white mb-1.5">Kontrol Start dari HP Kedua</div>
                <ul className="space-y-1.5 text-slate-400 list-disc pl-4">
                  <li>
                    Buka tab <strong className="text-white">Sync</strong> di HP kedua dengan kode
                    room yang sama dengan HP Pengemudi.
                  </li>
                  <li>
                    Pilih jarak target (<strong className="text-white">201m</strong> atau{' '}
                    <strong className="text-white">402m</strong>) pada panel Kontrol Lampu Start.
                  </li>
                  <li>
                    Tekan <strong className="text-emerald-400">START LAMPU</strong> untuk memulai
                    hitung mundur lampu Christmas Tree di HP pengemudi sekaligus HP kedua.
                  </li>
                  <li>
                    Tekan <strong className="text-red-400">MULAI RACE</strong> jika ingin langsung
                    mengaktifkan mode Rollout dari jarak jauh.
                  </li>
                </ul>
              </div>

              <div className="bg-[#07090E] border border-slate-800/80 rounded-lg p-3.5">
                <div className="font-semibold text-white mb-1.5">
                  Tampilan Lampu Besar &amp; Monitor Pit Wall
                </div>
                <ul className="space-y-1.5 text-slate-400 list-disc pl-4">
                  <li>
                    Saat lampu menyala, layar penuh{' '}
                    <strong className="text-amber-300">Lampu Start Besar</strong> otomatis muncul
                    di HP kedua sehingga bisa dijadikan lampu start lintasan untuk pembalap.
                  </li>
                  <li>
                    Gunakan tombol <strong className="text-white">Lampu Layar Penuh: ON / OFF</strong>{' '}
                    atau tombol <strong className="text-white">Kecilkan</strong> jika ingin langsung
                    memantau angka kecepatan &amp; split live.
                  </li>
                  <li>
                    Setelah finish, hasil waktu <strong>ET</strong>, <strong>RT</strong>, dan{' '}
                    <strong>Trap Speed</strong> otomatis tersimpan di kedua HP.
                  </li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* 5. Memahami Data, Garasi & Export PDF */}
        {show('data') && (
          <section className="bg-[#0F131C] border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="font-display font-bold text-lg text-white">
                  5. Membaca Hasil Data, Setting Garasi &amp; Export PDF
                </h2>
              </div>
              {onGoToGarage && (
                <button
                  type="button"
                  onClick={onGoToGarage}
                  className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  Buka Garasi →
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300 leading-relaxed">
              <div className="bg-[#07090E] border border-slate-800/80 rounded-lg p-3.5">
                <div className="font-semibold text-white mb-1.5">Arti Istilah di Layar</div>
                <ul className="space-y-1 text-slate-400">
                  <li>
                    <strong className="text-white font-mono">ET (Elapsed Time)</strong>: Total waktu
                    tempuh dari garis start hingga garis finish (201m/402m).
                  </li>
                  <li>
                    <strong className="text-emerald-400 font-mono">RT (Reaction Time)</strong>:
                    Kecepatan reaksi pengemudi sejak lampu Hijau menyala sampai kendaraan bergerak.
                  </li>
                  <li>
                    <strong className="text-cyan-400 font-mono">Trap Speed</strong>: Kecepatan saat
                    melewati titik finish.
                  </li>
                  <li>
                    <strong className="text-white font-mono">Split 20m / 100m / 201m / 402m</strong>
                    : Waktu dan kecepatan di tiap pos jarak lintasan.
                  </li>
                  <li>
                    <strong className="text-emerald-300 font-mono">Est. WHP</strong>: Perkiraan
                    tenaga mesin di roda berdasarkan rumus bobot total &amp; trap speed.
                  </li>
                </ul>
              </div>

              <div className="bg-[#07090E] border border-slate-800/80 rounded-lg p-3.5 flex flex-col gap-2">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-red-400" />
                  <span>Garasi &amp; Cetak Laporan</span>
                </div>
                <ul className="space-y-1.5 text-slate-400 list-disc pl-4">
                  <li>
                    Di tab <strong className="text-white">Garasi</strong>, masukkan profil motor
                    atau mobil Anda beserta <strong className="text-white">Berat Total (kg)</strong>{' '}
                    (berat kendaraan + berat pembalap) agar kalkulasi <strong>Est. WHP</strong>{' '}
                    akurat.
                  </li>
                  <li>
                    Di tab <strong className="text-white">Statistik</strong>, Anda bisa membandingkan
                    grafik run terbaru terhadap rekor tercepat (<strong className="text-white">PB / Personal Best</strong>).
                  </li>
                  <li className="flex items-start gap-1">
                    <FileText className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <span>
                      Tekan tombol <strong>Export PDF</strong> atau <strong>CSV</strong> untuk
                      menyimpan lembar hasil resmi lengkap dengan logo SAG Race Time dan tabel
                      split tiap run.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* 6. Tips & Solusi Cepat */}
        {show('trouble') && (
          <section className="bg-[#0F131C] border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <h2 className="font-display font-bold text-lg text-white">
                6. Troubleshooting &amp; Tips Lapangan
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300 leading-relaxed">
              <div className="bg-[#07090E] border border-slate-800/80 rounded-lg p-3.5">
                <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Jika Sensor Terlalu Sensitif / Kurang Sensitif</span>
                </div>
                <p className="text-slate-400">
                  Selalu lakukan <strong className="text-white">Kalibrasi 0G</strong> sambil mesin
                  menyala diam sebelum start. Jika sering FOUL karena getaran mesin, ubah level ke{' '}
                  <strong className="text-emerald-300">Anti-Getar</strong>. Jika tarikan pelan telat
                  terbaca, ubah ke <strong className="text-amber-300">Sensitif</strong>.
                </p>
              </div>

              <div className="bg-[#07090E] border border-slate-800/80 rounded-lg p-3.5">
                <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Jika Sinkronisasi 2 HP Belum Tersambung</span>
                </div>
                <p className="text-slate-400">
                  Cek ulang apakah pojok kanan atas kedua HP menampilkan{' '}
                  <strong className="text-cyan-300">Kode Room yang sama persis</strong>, pastikan
                  kuota/Wi-Fi aktif, lalu masuk ke tab <strong>Sync</strong> dan tekan tombol{' '}
                  <strong>Sync</strong> untuk menyambungkan ulang seketika.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
