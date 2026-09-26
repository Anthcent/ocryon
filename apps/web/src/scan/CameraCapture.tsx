import clsx from 'clsx';
import { Check, Flashlight, FlashlightOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  onCapture: (image: Blob) => void;
  onClose: () => void;
  /** Se llama si el navegador no permite usar la cámara en vivo (p. ej. sin HTTPS). */
  onUnavailable: (reason: string) => void;
}

/**
 * Cámara a pantalla completa en modo ráfaga: se pueden tomar varias fotos seguidas
 * (una por página) y cerrar al terminar.
 */
export function CameraCapture({ onCapture, onClose, onUnavailable }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(0);
  const [lastThumb, setLastThumb] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

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
        const denied = err?.name === 'NotAllowedError';
        onUnavailable(
          denied
            ? 'No diste permiso para usar la cámara. Actívalo en tu navegador o sube las fotos desde la galería.'
            : 'No se pudo abrir la cámara. Puedes tomar la foto con la cámara del sistema.',
        );
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onUnavailable]);

  useEffect(() => () => {
    if (lastThumb) URL.revokeObjectURL(lastThumb);
  }, [lastThumb]);

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
      (blob) => {
        if (!blob) return;
        onCapture(blob);
        setCount((c) => c + 1);
        setLastThumb(URL.createObjectURL(blob));
      },
      'image/jpeg',
      0.92,
    );
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    navigator.vibrate?.(30);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-4">
        <button onClick={onClose} aria-label="Cerrar cámara" className="rounded-full bg-white/15 p-3">
          <X className="size-6" />
        </button>
        <div className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-extrabold">
          {count === 0 ? 'Enfoca la página' : `${count} ${count === 1 ? 'página' : 'páginas'}`}
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
        {/* Guía de encuadre */}
        <div className="pointer-events-none absolute inset-6 rounded-3xl border-2 border-dashed border-white/40" />
        <div className={clsx('pointer-events-none absolute inset-0 bg-white transition-opacity', flash ? 'opacity-70' : 'opacity-0')} />
      </div>

      <div className="pb-safe flex items-center justify-between px-8 py-6">
        <div className="size-14 overflow-hidden rounded-xl border-2 border-white/40 bg-white/10">
          {lastThumb && <img src={lastThumb} alt="Última foto" className="size-full object-cover" />}
        </div>
        <button
          onClick={shoot}
          disabled={!ready}
          aria-label="Tomar foto"
          className="flex size-20 items-center justify-center rounded-full border-4 border-white transition active:scale-90 disabled:opacity-40"
        >
          <span className="size-16 rounded-full bg-white" />
        </button>
        <button
          onClick={onClose}
          aria-label="Terminar"
          className="flex size-14 items-center justify-center rounded-full bg-feather shadow-[0_4px_0_#58a700] active:translate-y-1 active:shadow-none"
        >
          <Check className="size-7" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
