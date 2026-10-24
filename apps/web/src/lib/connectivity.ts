import { useEffect, useState } from 'react';

let offlineOcrReady = false;

/** Prepare the Tesseract module and its self-hosted assets before disconnecting. */
export async function prepareOfflineOcr() {
  if (!('serviceWorker' in navigator) || !navigator.onLine) return;
  try {
    await navigator.serviceWorker.register('/ocr-offline-sw.js');
    await navigator.serviceWorker.ready;
    await import('tesseract.js');
    offlineOcrReady = true;
    window.dispatchEvent(new Event('offline-ocr-ready'));
  } catch {
    // A failed prefetch must never prevent online OCR from working.
  }
}

export function useConnectivity() {
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(offlineOcrReady);
  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); setOfflineReady(offlineOcrReady); };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('offline-ocr-ready', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('offline-ocr-ready', update);
    };
  }, []);
  return { online, offlineReady };
}
