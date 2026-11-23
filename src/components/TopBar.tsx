import { BookOpen, Maximize2, Minimize2 } from 'lucide-react';

export type ActiveTab = 'cockpit' | 'stats' | 'garage' | 'sync' | 'guide';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  roomId: string;
  onOpenRoomSetup: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const NAV_ITEMS: Array<{ id: Exclude<ActiveTab, 'guide'>; label: string }> = [
  { id: 'cockpit', label: 'Cockpit' },
  { id: 'stats', label: 'Statistik' },
  { id: 'garage', label: 'Garasi' },
  { id: 'sync', label: 'Sync' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  roomId,
  onOpenRoomSetup,
  isFullscreen,
  onToggleFullscreen,
}: TopBarProps) {
  const isGuideActive = activeTab === 'guide';

  return (
    <header className="h-11 shrink-0 bg-[#0B0E17] border-b border-slate-800/90 px-2 sm:px-4 flex items-center justify-between gap-1.5 sm:gap-6">
      {/* Zone 1: Brand logo & single-line title */}
      <div className="flex items-center gap-2 shrink-0">
        <img
          src="/assets/aistudio/file_0000000001608211a204a5f2a2642ae1_12ae24ff.png"
          alt="SAG Race Time"
          referrerPolicy="no-referrer"
          className="h-8 w-8 rounded-md object-cover shrink-0"
        />
        <span className="hidden min-[460px]:inline font-display font-extrabold text-base sm:text-lg tracking-tight text-white whitespace-nowrap shrink-0">
          SAG Race Time
        </span>
      </div>

      {/* Zone 2: Clean single-line navigation links */}
      <nav aria-label="Navigasi Utama" className="flex items-center gap-2 sm:gap-6">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`relative py-2.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-sm ${
                isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Room Switcher, Panduan, Install & Fullscreen actions */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onOpenRoomSetup}
          title="Ganti Kode Room"
          aria-label={`Kode Room ${roomId}, ketuk untuk ganti`}
          className="h-7 px-2 text-[11px] sm:text-xs font-mono font-bold text-cyan-400 bg-[#07090E] hover:bg-slate-800 border border-slate-700 rounded-md transition-colors whitespace-nowrap max-w-[70px] sm:max-w-[110px] truncate cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          {roomId}
        </button>
        <button
          type="button"
          onClick={() => onSelectTab(isGuideActive ? 'cockpit' : 'guide')}
          title="Panduan Cara Pemakaian"
          aria-label="Panduan Cara Pemakaian"
          className={`h-7 px-2 text-xs font-semibold border rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
            isGuideActive
              ? 'bg-red-600/20 border-red-500 text-red-300'
              : 'bg-[#07090E] hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Panduan</span>
        </button>
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Keluar dari Layar Penuh' : 'Mode Layar Penuh'}
          className="h-7 px-2 sm:px-3 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Keluar Penuh</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Layar Penuh</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
