import { useSyncExternalStore } from 'react';
import { tr } from '../i18n';

function subscribeOnline(onStoreChange: () => void): () => void {
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

const getOnlineSnapshot = () => (typeof navigator === 'undefined' ? true : navigator.onLine);
const getServerSnapshot = () => true;

export function OfflineBannerView({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print flex items-center justify-center gap-2 border-b border-warn/40 bg-warn-soft px-4 py-2 text-center text-[12px] font-medium text-warn-ink"
    >
      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
        wifi_off
      </span>
      <span>{tr('You appear to be offline. SkillProof will reconnect automatically when your network returns.')}</span>
    </div>
  );
}

/** Non-intrusive connectivity banner for unstable networks and offline environments. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);
  return <OfflineBannerView online={online} />;
}
