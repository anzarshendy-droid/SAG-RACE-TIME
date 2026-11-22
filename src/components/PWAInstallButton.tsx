import { useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        aria-label="Install Aplikasi ke HP"
        className="h-7 px-2 sm:px-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Install di iPhone atau iPad"
          className="h-7 px-2 sm:px-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-xl bg-[#0F131C] border border-slate-700 p-5 shadow-2xl">
              <h3 className="font-display font-bold text-lg text-white">
                Install SAG Race Time di iOS
              </h3>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                1. Ketuk ikon <strong className="text-white">Share</strong> pada toolbar Safari.
                <br />
                2. Gulir ke bawah dan pilih{' '}
                <strong className="text-white">Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-md bg-red-600 hover:bg-red-500 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-3 left-3 z-40 flex items-center gap-2 rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg pointer-events-none">
      <WifiOff className="w-3.5 h-3.5" />
      <span>Mode Offline · Data disimpan lokal</span>
    </div>
  );
}
