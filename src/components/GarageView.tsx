import { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { computeVehicleStats, formatSec, formatSpeed } from '../lib/stats';
import type { DragRunRecord, VehicleCategory, VehicleProfile } from '../types/telemetry';

interface GarageViewProps {
  vehicles: VehicleProfile[];
  activeVehicleId: string;
  runs: DragRunRecord[];
  onSelectVehicle: (id: string) => void;
  onUpsertVehicle: (vehicle: VehicleProfile) => void;
  onDeleteVehicle: (id: string) => void;
}

const CATEGORIES: VehicleCategory[] = [
  'Motor 2-Tak',
  'Motor 4-Tak',
  'Mobil Street',
  'Mobil Pro',
  'Custom',
];

export function GarageView({
  vehicles,
  activeVehicleId,
  runs,
  onSelectVehicle,
  onUpsertVehicle,
  onDeleteVehicle,
}: GarageViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<VehicleCategory>('Motor 2-Tak');
  const [weightKg, setWeightKg] = useState<string>('165');
  const [powerSpec, setPowerSpec] = useState('');
  const [tireSpec, setTireSpec] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCategory('Motor 2-Tak');
    setWeightKg('165');
    setPowerSpec('');
    setTireSpec('');
    setNotes('');
  };

  const loadForEdit = (v: VehicleProfile) => {
    setEditingId(v.id);
    setName(v.name);
    setCategory(v.category);
    setWeightKg(String(v.weightKg));
    setPowerSpec(v.powerSpec);
    setTireSpec(v.tireSpec);
    setNotes(v.notes);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const parsedWeight = Math.max(40, Math.min(4000, Number(weightKg) || 165));
    const profile: VehicleProfile = {
      id: editingId ?? `veh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      category,
      weightKg: parsedWeight,
      powerSpec: powerSpec.trim() || '-',
      tireSpec: tireSpec.trim() || '-',
      notes: notes.trim(),
      updatedAt: Date.now(),
    };
    onUpsertVehicle(profile);
    onSelectVehicle(profile.id);
    resetForm();
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto sag-scroll bg-[#07090E] p-3 md:p-5">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Vehicle List */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div>
            <h1 className="font-display font-bold text-2xl text-white tracking-tight">
              Garasi &amp; Profil Kendaraan
            </h1>
            <p className="text-xs text-slate-400">
              Profil kendaraan disinkronkan real-time. Bobot total (unit + pengemudi) dipakai untuk
              estimasi WHP dan kalibrasi fisika.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            {vehicles.map((v) => {
              const isActive = v.id === activeVehicleId;
              const stats = computeVehicleStats(runs, v.id);
              return (
                <div
                  key={v.id}
                  className={`bg-[#0F131C] border rounded-lg p-3.5 transition-colors ${
                    isActive ? 'border-red-500/80' : 'border-slate-800/90'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-base text-white">{v.name}</h2>
                        {isActive && (
                          <span className="text-[11px] font-mono font-semibold text-emerald-400">
                            ● Aktif di Cockpit
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {v.category} · {v.weightKg} kg · {v.powerSpec} · Ban: {v.tireSpec}
                      </div>
                      {v.notes && <p className="text-xs text-slate-500 mt-1">{v.notes}</p>}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => onSelectVehicle(v.id)}
                          className="px-2.5 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-md cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Pakai</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => loadForEdit(v)}
                        className="px-2.5 py-1.5 text-xs font-medium bg-[#07090E] hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-md cursor-pointer"
                      >
                        Edit
                      </button>
                      {vehicles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteVehicle(v.id)}
                          aria-label={`Hapus ${v.name}`}
                          className="p-1.5 text-slate-400 hover:text-red-400 rounded-md cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mini stats strip */}
                  <div className="grid grid-cols-4 gap-2 mt-3 pt-2.5 border-t border-slate-800/70 text-xs font-mono tabular-nums">
                    <div>
                      <span className="text-[10px] font-sans text-slate-500 block">Total Run</span>
                      <span className="text-slate-200">{stats.totalRuns}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans text-slate-500 block">Best 201m</span>
                      <span className="text-white">{formatSec(stats.best201m)}s</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans text-slate-500 block">Best 402m</span>
                      <span className="text-white">{formatSec(stats.best402m)}s</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans text-slate-500 block">Top Speed</span>
                      <span className="text-cyan-400">{formatSpeed(stats.peakSpeed)} km/h</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add / Edit Vehicle Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-[#0F131C] border border-slate-800/90 rounded-lg p-4 h-fit flex flex-col gap-3"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h2 className="font-semibold text-sm text-white">
              {editingId ? 'Edit Profil Kendaraan' : 'Tambah Kendaraan Baru'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Batal Edit
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Nama Unit / Kendaraan</label>
            <input
              type="text"
              required
              maxLength={48}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Ninja 150RR Tune Up #21"
              className="w-full bg-[#07090E] border border-slate-800 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Kategori</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as VehicleCategory)}
                className="w-full bg-[#07090E] border border-slate-800 rounded-md px-2.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Bobot Total (kg)</label>
              <input
                type="number"
                min={40}
                max={4000}
                required
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="w-full bg-[#07090E] border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Spesifikasi Mesin</label>
              <input
                type="text"
                maxLength={48}
                value={powerSpec}
                onChange={(e) => setPowerSpec(e.target.value)}
                placeholder="155cc / 2.0T Stage 2"
                className="w-full bg-[#07090E] border border-slate-800 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Setup Ban / Tekanan</label>
              <input
                type="text"
                maxLength={48}
                value={tireSpec}
                onChange={(e) => setTireSpec(e.target.value)}
                placeholder="Drag Slick 18 PSI"
                className="w-full bg-[#07090E] border border-slate-800 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Catatan Tuning / Rasio Gir</label>
            <textarea
              rows={2}
              maxLength={160}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Final gear 14/38, spuyer 135/42..."
              className="w-full bg-[#07090E] border border-slate-800 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{editingId ? 'Simpan Perubahan' : 'Simpan & Aktifkan Kendaraan'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
