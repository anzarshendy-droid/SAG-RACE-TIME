import { useState } from 'react';
import { Flag, Gauge, Shuffle } from 'lucide-react';
import type { ActiveTab } from './TopBar';

interface RoomSetupScreenProps {
  initialRoomId: string;
  onEnterRoom: (roomId: string, initialTab: ActiveTab) => void;
}

function sanitizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24);
}

function generateRandomRoomCode(): string {
  const num = Math.floor(100 + Math.random() * 900);
  return `SAG-${num}`;
}

export function RoomSetupScreen({ initialRoomId, onEnterRoom }: RoomSetupScreenProps) {
  const [roomInput, setRoomInput] = useState<string>(initialRoomId || 'SAG-01');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleEnter = (tab: ActiveTab) => {
    const cleaned = sanitizeRoomCode(roomInput);
    if (cleaned.length < 2) {
      setErrorMsg('Masukkan minimal 2 karakter huruf atau angka.');
      return;
    }
    setErrorMsg(null);
    onEnterRoom(cleaned, tab);
  };

  return (
    <div className="h-dvh w-screen overflow-y-auto bg-[#07090E] text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0F131C] border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col gap-5">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-2.5">
          <img
            src="/assets/aistudio/file_0000000001608211a204a5f2a2642ae1_12ae24ff.png"
            alt="SAG Race Time"
            referrerPolicy="no-referrer"
            className="w-16 h-16 rounded-2xl object-cover shadow-lg border border-slate-700/80"
          />
          <div>
            <h1 className="font-display font-extrabold text-2xl text-white tracking-tight">
              SAG Race Time
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Masukkan kode room yang sama pada HP Pengemudi dan HP Starter untuk sinkronisasi
              real-time 201m / 402m.
            </p>
          </div>
        </div>

        {/* Room Code Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleEnter('cockpit');
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="initial-room-code"
                className="text-xs font-semibold uppercase tracking-wider text-slate-300"
              >
                Kode Room Sinkronisasi
              </label>
              <button
                type="button"
                onClick={() => {
                  setRoomInput(generateRandomRoomCode());
                  setErrorMsg(null);
                }}
                className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
              >
                <Shuffle className="w-3 h-3" />
                <span>Acak Kode</span>
              </button>
            </div>

            <input
              id="initial-room-code"
              type="text"
              maxLength={24}
              autoFocus
              value={roomInput}
              onChange={(e) => {
                setRoomInput(e.target.value.toUpperCase());
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="CONTOH: SAG-01"
              className="w-full h-13 bg-[#07090E] border border-slate-700 focus:border-red-500 rounded-xl px-4 text-center text-2xl font-mono font-bold tracking-widest text-white uppercase focus:outline-none focus:ring-2 focus:ring-red-500/40"
            />
            {errorMsg && <p className="text-xs text-red-400 font-medium">{errorMsg}</p>}
          </div>

          {/* Role Launch Buttons */}
          <div className="flex flex-col gap-2.5 pt-1">
            <button
              type="submit"
              className="w-full min-h-[48px] px-4 py-3 bg-red-600 hover:bg-red-500 active:scale-[0.99] text-white font-display font-bold text-base sm:text-lg tracking-wide uppercase rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
            >
              <Gauge className="w-5 h-5" />
              <span>HP 1 · Pengemudi (Cockpit)</span>
            </button>

            <button
              type="button"
              onClick={() => handleEnter('sync')}
              className="w-full min-h-[48px] px-4 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-display font-bold text-base sm:text-lg tracking-wide uppercase rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
            >
              <Flag className="w-5 h-5" />
              <span>HP 2 · Starter / Lampu Besar</span>
            </button>
          </div>
        </form>

        <p className="text-[11px] text-center text-slate-500 leading-relaxed">
          Anda bisa mengganti kode room kapan saja melalui tombol kode room di pojok kanan atas.
        </p>
      </div>
    </div>
  );
}
