import { Maximize2, Minimize2 } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

export type ActiveTab = 'cockpit' | 'stats' | 'garage' | 'sync';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'cockpit', label: 'Cockpit' },
  { id: 'stats', label: 'Statistik' },
  { id: 'garage', label: 'Garasi' },
  { id: 'sync', label: 'Sync' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  isFullscreen,
  onToggleFullscreen,
}: TopBarProps) {
  return (
    <header className="h-11 shrink-0 bg-[#0B0E17] border-b border-slate-800/90 px-2.5 sm:px-4 flex items-center justify-between gap-2 sm:gap-8">
      {/* Zone 1: Brand logo & single-line title */}
      <div className="flex items-center gap-2 shrink-0">
        <img
          src="/assets/aistudio/file_0000000001608211a204a5f2a2642ae1_12ae24ff.png"
          alt="SAG Race Time"
          referrerPolicy="no-referrer"
          className="h-8 w-8 rounded-md object-cover shrink-0"
        />
        <span className="hidden min-[400px]:inline font-display font-extrabold text-base sm:text-lg tracking-tight text-white whitespace-nowrap shrink-0">
          SAG Race Time
        </span>
      </div>

      {/* Zone 2: Clean single-line navigation links */}
      <nav aria-label="Navigasi Utama" className="flex items-center gap-3 sm:gap-6">
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

      {/* Zone 3: Install & Fullscreen actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <PWAInstallButton />
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Keluar dari Layar Penuh' : 'Mode Layar Penuh'}
          className="h-7 px-2.5 sm:px-3 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
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
