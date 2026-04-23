import { useState } from 'react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { Button } from '@/components/ui/button';
import { X, Download, Smartphone } from 'lucide-react';

/**
 * Shows an "Add to Home Screen" banner on Android/Chrome when the PWA install
 * prompt is available. On iOS Safari, shows manual instructions since iOS
 * doesn't support the beforeinstallprompt event.
 */
export function PwaInstallBanner() {
  const { canInstall, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showIosHint, setShowIosHint] = useState(() => {
    // Show iOS hint once per session if on iOS Safari and not already installed
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const alreadyShown = sessionStorage.getItem('hp-ios-hint-shown');
    return isIos && !isStandalone && !alreadyShown;
  });

  if (dismissed && !showIosHint) return null;

  // iOS manual install hint
  if (showIosHint) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 bg-[#1e3a5f] text-white rounded-xl shadow-2xl p-4 flex gap-3 items-start max-w-sm mx-auto">
        <Smartphone className="w-5 h-5 mt-0.5 shrink-0 text-blue-300" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Add to Home Screen</p>
          <p className="text-xs text-blue-200 mt-0.5">
            Tap <strong>Share</strong> then <strong>"Add to Home Screen"</strong> to install the HP Estimator app.
          </p>
        </div>
        <button
          onClick={() => {
            sessionStorage.setItem('hp-ios-hint-shown', '1');
            setShowIosHint(false);
          }}
          className="text-blue-300 hover:text-white shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Android / Chrome install prompt
  if (!canInstall || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-[#1e3a5f] text-white rounded-xl shadow-2xl p-4 flex gap-3 items-center max-w-sm mx-auto">
      <Download className="w-5 h-5 shrink-0 text-blue-300" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Install HP Estimator</p>
        <p className="text-xs text-blue-200 mt-0.5">Add to your home screen for quick access.</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="text-blue-300 hover:text-white h-8 px-2"
          onClick={() => setDismissed(true)}
        >
          <X className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          className="bg-white text-[#1e3a5f] hover:bg-blue-50 h-8 px-3 text-xs font-semibold"
          onClick={install}
        >
          Install
        </Button>
      </div>
    </div>
  );
}
