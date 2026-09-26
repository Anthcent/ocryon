import clsx from 'clsx';
import { Check, Flashlight, FlashlightOff, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PendingPage } from '../lib/pages-store';
import { useScanSession } from './ScanSession';
import { ScanProgressBar } from './ScanProgressBar';
import type { ScanProgress } from './ScanSession';
import { STATUS } from './status';
import { useObjectUrl } from './useObjectUrl';

interface Props {
  onClose: () => void;
  /** Se llama si el navegador no permite usar la cámara en vivo (p. ej. sin HTTPS). */
  onUnavailable: (reason: string) => void;
}

/**
 * Cámara a pantalla completa en modo ráfaga. Abajo se ven, numeradas, las fotos de esta
 * sesión: se puede quitar cualquiera antes de terminar.
 */
export function CameraCapture({ onClose, onUnavailable }: Props) {
  const session = useScanSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [capturedIds, setCapturedIds] = useState<string[]>([]);

  // Fotos de esta sesión de cámara que siguen existiendo (se pueden quitar desde aquí).
  const captured = capturedIds
    .map((id) => session.pages.find((p) => p.id === id))
    .filter((p): p is PendingPage => Boolean(p));
  const offset = session.pages.length - captured.length;

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      onUnavailable('Tu navegador no permite usar la cámara aquí. Puedes tomar la foto con la cámara del sistema.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          void video.play();
        }
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchSupported(Boolean(caps?.torch));
      })
      .catch((err: DOMException) => {
        onUnavailable(
          err?.name === 'NotAllowedError'
            ? 'No diste permiso para usar la cámara. Actívalo en tu navegador o sube las fotos desde la galería.'
            : 'No se pudo abrir la cámara. Puedes tomar la foto con la cámara del sistema.',
        );
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onUnavailable]);

  useEffect(() => {
    stripRef.current?.scrollTo({ left: stripRef.current.scrollWidth, behavior: 'smooth' });
  }, [capturedIds.length]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }).catch(() => {});
    setTorchOn(next);
  };

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const { ids } = await session.addImages([blob]);
        setCapturedIds((c) => [...c, ...ids]);
      },
      'image/jpeg',
      0.92,
    );
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    navigator.vibrate?.(30);
  };

  const count = captured.length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 p-4">
        <button onClick={onClose} aria-label="Cerrar cámara" className="rounded-full bg-white/15 p-3">
          <X className="size-6" />
        </button>
        <div className="flex flex-col items-center">
          <div className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-extrabold">
            {count === 0 ? 'Enfoca la página' : `${count} ${count === 1 ? 'página' : 'páginas'}`}
          </div>
          {session.autoScan && (
            <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-bee">
              <Zap className="size-3" fill="currentColor" /> Escaneo automático
            </span>
          )}
        </div>
        {torchSupported ? (
          <button onClick={toggleTorch} aria-label="Linterna" className={clsx('rounded-full p-3', torchOn ? 'bg-bee text-eel' : 'bg-white/15')}>
            {torchOn ? <Flashlight className="size-6" /> : <FlashlightOff className="size-6" />}
          </button>
        ) : (
          <span className="size-12" />
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted onLoadedData={() => setReady(true)} className="absolute inset-0 size-full object-contain" />
        <div className="pointer-events-none absolute inset-6 rounded-3xl border-2 border-dashed border-white/40" />
        <div className={clsx('pointer-events-none absolute inset-0 bg-white transition-opacity', flash ? 'opacity-70' : 'opacity-0')} />
      </div>

      {/* Fotos tomadas en esta sesión */}
      {count > 0 && (
        <div ref={stripRef} className="flex gap-2 overflow-x-auto px-4 pt-3" aria-label="Fotos tomadas">
          {captured.map((p, i) => (
            <CapturedThumb key={p.id} page={p} progress={session.progress[p.id]} n={offset + i + 1} onRemove={() => session.remove(p.id)} />
          ))}
        </div>
      )}

      <div className="pb-safe flex items-center justify-between px-8 py-5">
        <span className="w-24 text-xs font-bold text-white/70">{count > 0 ? 'Toca ✕ para quitar una foto' : ''}</span>
        <button
          onClick={shoot}
          disabled={!ready}
          aria-label="Tomar foto"
          className="flex size-20 shrink-0 items-center justify-center rounded-full border-4 border-white transition active:scale-90 disabled:opacity-40"
        >
          <span className="size-16 rounded-full bg-white" />
        </button>
        <div className="flex w-24 justify-end">
          <button
            onClick={onClose}
            aria-label="Terminar"
            className="flex h-14 items-center gap-1 rounded-2xl bg-feather px-4 font-extrabold uppercase shadow-[0_4px_0_#58a700] active:translate-y-1 active:shadow-none"
          >
            <Check className="size-6" strokeWidth={3} />
            {count > 0 && <span>Listo</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

function CapturedThumb({ page, progress, n, onRemove }: { page: PendingPage; progress?: ScanProgress; n: number; onRemove: () => void }) {
  const url = useObjectUrl(page.image);
  return (
    <div className="relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-xl border-2 border-white/60 bg-white/10">
      {url && <img src={url} alt={`Foto ${n}`} className="size-full object-cover" />}
      <span className="absolute bottom-1 left-1 flex size-6 items-center justify-center rounded-md bg-white text-xs font-black text-eel">{n}</span>
      {page.status === 'scanning' ? (
        <div className="absolute inset-x-1 bottom-8">
          <ScanProgressBar progress={progress} size="sm" dark />
        </div>
      ) : (
        <span className={clsx('absolute bottom-1.5 right-1.5 size-3 rounded-full ring-2 ring-white', STATUS[page.status].dot)} />
      )}
      <button
        onClick={onRemove}
        disabled={page.status === 'scanning'}
        aria-label={`Quitar foto ${n}`}
        className="absolute right-0.5 top-0.5 flex size-7 items-center justify-center rounded-full bg-black/60 disabled:opacity-40"
      >
        <X className="size-4" strokeWidth={3} />
      </button>
    </div>
  );
}
