import clsx from 'clsx';
import { ChevronLeft, ChevronRight, CircleAlert, Pencil, RotateCw, ScanLine, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, IconButton, Spinner } from '../components/ui';
import { ENGINE_LABEL } from '../lib/constants';
import type { PendingPage } from '../lib/pages-store';

export function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

const STATUS: Record<PendingPage['status'], { label: string; tone: 'gray' | 'blue' | 'green' | 'red' | 'yellow' }> = {
  pending: { label: 'Sin escanear', tone: 'gray' },
  queued: { label: 'En cola', tone: 'yellow' },
  scanning: { label: 'Escaneando', tone: 'blue' },
  done: { label: 'Listo', tone: 'green' },
  error: { label: 'Error', tone: 'red' },
};

interface Props {
  page: PendingPage;
  index: number;
  total: number;
  onScan: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}

export function PageCard({ page, index, total, onScan, onEdit, onRemove, onMove }: Props) {
  const url = useObjectUrl(page.image);
  const status = STATUS[page.status];

  return (
    <div
      className={clsx(
        'flex flex-col overflow-hidden rounded-2xl border-2 border-b-4 bg-white',
        page.status === 'done' ? 'border-feather/60' : page.status === 'error' ? 'border-cardinal/60' : 'border-swan',
      )}
    >
      <button type="button" onClick={onEdit} className="relative aspect-[3/4] bg-polar" aria-label={`Ver página ${index + 1}`}>
        {url && <img src={url} alt={`Página ${index + 1}`} className="size-full object-cover" />}
        <span className="absolute left-2 top-2 flex size-8 items-center justify-center rounded-xl bg-white text-sm font-black shadow">
          {index + 1}
        </span>
        {page.status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Spinner className="size-10" />
          </div>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {page.engine && page.status === 'done' && <span className="text-xs font-bold text-hare">{ENGINE_LABEL[page.engine]}</span>}
        </div>
        {page.status === 'done' && page.text && <p className="line-clamp-3 text-xs text-wolf">{page.text}</p>}
        {page.error && (
          <p className="flex gap-1 text-xs font-bold text-cardinal">
            <CircleAlert className="size-4 shrink-0" />
            {page.error}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-1">
          <div className="flex">
            <IconButton label="Mover antes" disabled={index === 0} onClick={() => onMove(-1)} className="size-8">
              <ChevronLeft className="size-4" />
            </IconButton>
            <IconButton label="Mover después" disabled={index === total - 1} onClick={() => onMove(1)} className="size-8">
              <ChevronRight className="size-4" />
            </IconButton>
          </div>
          <div className="flex">
            {(page.status === 'pending' || page.status === 'error' || page.status === 'done') && (
              <IconButton label={page.status === 'done' ? 'Volver a escanear' : 'Escanear'} onClick={onScan} className="size-8 text-macaw">
                {page.status === 'done' ? <RotateCw className="size-4" /> : <ScanLine className="size-4" />}
              </IconButton>
            )}
            <IconButton label="Editar texto" onClick={onEdit} className="size-8">
              <Pencil className="size-4" />
            </IconButton>
            <IconButton label="Eliminar" onClick={onRemove} disabled={page.status === 'scanning'} className="size-8 hover:text-cardinal">
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}
