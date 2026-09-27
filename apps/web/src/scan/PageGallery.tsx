import clsx from 'clsx';
import { ChevronLeft, ChevronRight, CircleAlert, ImagePlus, X } from 'lucide-react';
import { detectPageLabel } from '../lib/page-number';
import type { PendingPage } from '../lib/pages-store';
import { ScanProgressBar } from './ScanProgressBar';
import type { ScanProgress } from './ScanSession';
import { STATUS } from './status';
import { useObjectUrl } from './useObjectUrl';

interface Props {
  pages: PendingPage[];
  progress: Record<string, ScanProgress>;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  onScan: (id: string) => void;
  onAdd: () => void;
}

/** Galería de las fotos cargadas, numeradas en el orden en que se guardarán. */
export function PageGallery({ pages, progress, onOpen, onRemove, onMove, onScan, onAdd }: Props) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
      {pages.map((page, i) => (
        <PageThumb
          key={page.id}
          page={page}
          progress={progress[page.id]}
          index={i}
          total={pages.length}
          onOpen={() => onOpen(page.id)}
          onRemove={() => onRemove(page.id)}
          onMove={(d) => onMove(page.id, d)}
          onScan={() => onScan(page.id)}
        />
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-hare text-wolf transition hover:border-macaw hover:bg-macaw-light hover:text-macaw-dark"
      >
        <ImagePlus className="size-9" />
        <span className="text-sm font-extrabold uppercase">Añadir más</span>
      </button>
    </div>
  );
}

function PageThumb({
  page,
  progress,
  index,
  total,
  onOpen,
  onRemove,
  onMove,
  onScan,
}: {
  page: PendingPage;
  progress?: ScanProgress;
  index: number;
  total: number;
  onOpen: () => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  onScan: () => void;
}) {
  const url = useObjectUrl(page.image);
  const status = STATUS[page.status];
  const n = index + 1;
  // Número de página impreso en la hoja, si el OCR lo reconoció.
  const pageLabel = page.status === 'done' ? detectPageLabel(page.text) : '';

  return (
    <div
      data-testid="page-card"
      className={clsx(
        'flex flex-col overflow-hidden rounded-2xl border-2 border-b-4 bg-white',
        page.status === 'done' ? 'border-feather' : page.status === 'error' ? 'border-cardinal' : 'border-swan',
      )}
    >
      <div className="relative aspect-[3/4] bg-polar">
        <button type="button" onClick={onOpen} className="absolute inset-0" aria-label={`Ver página ${n}`}>
          {url && <img src={url} alt={`Página ${n}`} className="size-full object-cover" />}
        </button>
        <span className="pointer-events-none absolute left-2 top-2 flex size-9 items-center justify-center rounded-xl border-2 border-b-4 border-swan bg-white text-base font-black">
          {n}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={page.status === 'scanning'}
          aria-label={`Quitar página ${n}`}
          title="Quitar"
          className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-eel/70 text-white backdrop-blur transition hover:bg-cardinal disabled:opacity-40"
        >
          <X className="size-5" strokeWidth={3} />
        </button>
        {page.status === 'scanning' ? (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-xl bg-white/95 p-2 shadow-lg">
            <ScanProgressBar progress={progress} />
          </div>
        ) : (
          <span className={clsx('pointer-events-none absolute bottom-2 left-2 rounded-lg px-2 py-0.5 text-xs font-extrabold uppercase shadow', status.pill)}>
            {status.label}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2">
        {page.status === 'done' && page.text && <p className="line-clamp-2 px-1 text-xs text-wolf">{page.text}</p>}
        {pageLabel && (
          <span className="self-start rounded-lg bg-feather-light px-2 py-0.5 text-[11px] font-extrabold text-feather-dark">pág. {pageLabel}</span>
        )}
        {page.error && (
          <p className="flex gap-1 px-1 text-xs font-bold text-cardinal">
            <CircleAlert className="size-4 shrink-0" />
            {page.error}
          </p>
        )}
        {/* Mover a la izquierda · acción principal · mover a la derecha */}
        <div className="mt-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Mover antes"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="flex size-8 shrink-0 items-center justify-center rounded-xl text-wolf hover:bg-polar disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>
          {page.status === 'pending' || page.status === 'error' ? (
            <button
              type="button"
              onClick={onScan}
              aria-label="Escanear"
              className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl bg-macaw-light px-1 text-xs font-extrabold uppercase text-macaw-dark hover:bg-macaw hover:text-white"
            >
              <span className="truncate">Escanear</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpen}
              disabled={page.status !== 'done'}
              className="h-9 min-w-0 flex-1 truncate rounded-xl px-1 text-xs font-extrabold uppercase text-macaw hover:bg-polar disabled:text-hare"
            >
              {page.status === 'done' ? 'Ver texto' : 'Espera…'}
            </button>
          )}
          <button
            type="button"
            aria-label="Mover después"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            className="flex size-8 shrink-0 items-center justify-center rounded-xl text-wolf hover:bg-polar disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
