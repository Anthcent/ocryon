import clsx from 'clsx';
import { ChevronLeft, ChevronRight, CircleAlert, RotateCw, ScanLine, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Spinner, Textarea } from '../components/ui';
import { ENGINE_LABEL } from '../lib/constants';
import type { PendingPage } from '../lib/pages-store';
import { STATUS } from './status';
import { useObjectUrl } from './useObjectUrl';

interface Props {
  pages: PendingPage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onSaveText: (id: string, text: string) => void;
  onScan: (id: string) => void;
  onRotate: (id: string) => Promise<void>;
  onRemove: (id: string) => void;
}

/** Visor a pantalla completa: ver la foto en grande, recorrer páginas y todas sus opciones. */
export function PageViewer({ pages, index, onIndex, onClose, onSaveText, onScan, onRotate, onRemove }: Props) {
  const page = pages[index];
  const url = useObjectUrl(page?.image);
  const [text, setText] = useState(page?.text ?? '');
  const [rotating, setRotating] = useState(false);

  // Al cambiar de página, o cuando llega el texto escaneado, se actualiza el editor.
  useEffect(() => setText(page?.text ?? ''), [page?.id, page?.text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < pages.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, pages.length, onClose, onIndex]);

  if (!page) return null;
  const status = STATUS[page.status];
  const busy = page.status === 'scanning' || page.status === 'queued';
  const dirty = text !== page.text;

  return (
    <div role="dialog" aria-modal="true" aria-label={`Página ${index + 1}`} className="fixed inset-0 z-50 flex flex-col bg-eel lg:flex-row">
      {/* Imagen */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 p-3 text-white">
          <button onClick={onClose} aria-label="Cerrar" className="rounded-full bg-white/15 p-2.5 hover:bg-white/25">
            <X className="size-6" />
          </button>
          <div className="text-center">
            <div className="text-lg font-black">
              Página {index + 1} <span className="text-white/60">de {pages.length}</span>
            </div>
          </div>
          <span className={clsx('rounded-lg px-2 py-1 text-xs font-extrabold uppercase', status.pill)}>{status.label}</span>
        </div>
        <div className="relative min-h-0 flex-1">
          {url && <img src={url} alt={`Página ${index + 1}`} className="absolute inset-0 size-full object-contain p-2" />}
          {page.status === 'scanning' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner className="size-12 text-white" />
            </div>
          )}
          <button
            onClick={() => onIndex(index - 1)}
            disabled={index === 0}
            aria-label="Página anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-eel shadow-lg disabled:hidden"
          >
            <ChevronLeft className="size-7" />
          </button>
          <button
            onClick={() => onIndex(index + 1)}
            disabled={index === pages.length - 1}
            aria-label="Página siguiente"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-eel shadow-lg disabled:hidden"
          >
            <ChevronRight className="size-7" />
          </button>
        </div>
        {/* Tira de miniaturas para saltar a cualquier página */}
        <div className="flex gap-2 overflow-x-auto p-3">
          {pages.map((p, i) => (
            <Thumb key={p.id} page={p} n={i + 1} active={i === index} onClick={() => onIndex(i)} />
          ))}
        </div>
      </div>

      {/* Opciones y texto */}
      <div className="pb-safe flex max-h-[48vh] flex-col gap-3 overflow-y-auto rounded-t-3xl bg-white p-4 lg:max-h-none lg:w-[420px] lg:rounded-none lg:p-6">
        <div className="grid grid-cols-3 gap-2">
          <Button variant="plain" size="sm" icon={<RotateCw className="size-4" />} disabled={busy} loading={rotating}
            onClick={async () => {
              setRotating(true);
              await onRotate(page.id);
              setRotating(false);
            }}
          >
            Girar
          </Button>
          <Button variant="secondary" size="sm" icon={<ScanLine className="size-4" />} disabled={busy} onClick={() => onScan(page.id)}>
            {page.status === 'done' ? 'Reescanear' : 'Escanear'}
          </Button>
          <Button variant="danger" size="sm" icon={<Trash2 className="size-4" />} disabled={page.status === 'scanning'} onClick={() => onRemove(page.id)}>
            Quitar
          </Button>
        </div>

        {page.error && (
          <p className="flex gap-2 rounded-2xl bg-cardinal-light p-3 text-sm font-bold text-cardinal-dark">
            <CircleAlert className="size-5 shrink-0" /> {page.error}
          </p>
        )}

        <div className="flex items-center justify-between">
          <h3 className="font-black">Texto</h3>
          {page.engine && page.status === 'done' && <span className="text-xs font-bold text-hare">{ENGINE_LABEL[page.engine]}</span>}
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          disabled={busy}
          aria-label="Texto de la página"
          placeholder={busy ? 'Escaneando…' : 'Aún no se escanea. También puedes escribir el texto a mano.'}
          className="min-h-40 flex-1 text-sm"
        />
        <Button block disabled={!dirty || !text.trim() || busy} onClick={() => onSaveText(page.id, text)}>
          Guardar texto
        </Button>
      </div>
    </div>
  );
}

function Thumb({ page, n, active, onClick }: { page: PendingPage; n: number; active: boolean; onClick: () => void }) {
  const url = useObjectUrl(page.image);
  return (
    <button
      onClick={onClick}
      aria-label={`Ir a la página ${n}`}
      className={clsx('relative h-16 w-12 shrink-0 overflow-hidden rounded-lg border-2', active ? 'border-macaw' : 'border-transparent opacity-70')}
    >
      {url && <img src={url} alt="" className="size-full object-cover" />}
      <span className="absolute bottom-0 left-0 rounded-tr-md bg-white px-1 text-[10px] font-black">{n}</span>
      <span className={clsx('absolute right-1 top-1 size-2.5 rounded-full ring-2 ring-white', STATUS[page.status].dot)} />
    </button>
  );
}
