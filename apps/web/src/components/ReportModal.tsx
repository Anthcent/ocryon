import clsx from 'clsx';
import { Download, FileText, FileType2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { exportFile, FORMAT_INFO, type ExportModel } from '../lib/export';
import { errorMessage, useFeedback } from './feedback';
import { Button, Modal } from './ui';

type ReportFormat = 'docx' | 'pdf';

/**
 * Reporte en Word o PDF con una opción (p. ej. «incluir el texto leído») y, si se pasan
 * `items`, la posibilidad de elegir cuáles incluir.
 */
export function ReportModal<T extends { id: number }>({
  open,
  onClose,
  title,
  optionLabel,
  optionDefault = true,
  items,
  itemLabel,
  build,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  optionLabel?: string;
  optionDefault?: boolean;
  items?: T[];
  itemLabel?: (item: T) => string;
  build: (option: boolean, selected: T[]) => ExportModel;
}) {
  const { toast } = useFeedback();
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [option, setOption] = useState(optionDefault);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOption(optionDefault);
    setSelected(new Set(items?.map((i) => i.id) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chosen = items ? items.filter((i) => selected.has(i.id)) : [];

  const run = async () => {
    if (items && chosen.length === 0) return toast('Elige al menos uno', 'error');
    setBusy(true);
    try {
      const name = await exportFile(build(option, chosen), format);
      toast(`Listo: ${name}`);
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Formato">
          {(['docx', 'pdf'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={format === f}
              aria-label={FORMAT_INFO[f].label}
              onClick={() => setFormat(f)}
              className={clsx(
                'flex flex-col items-center gap-1 rounded-2xl border-2 border-b-4 py-3 font-black transition active:translate-y-[2px] active:border-b-2 [&>svg]:size-7',
                format === f
                  ? f === 'docx'
                    ? 'border-macaw bg-macaw-light text-macaw-dark'
                    : 'border-cardinal bg-cardinal-light text-cardinal-dark'
                  : 'border-swan text-wolf hover:bg-polar',
              )}
            >
              {f === 'docx' ? <FileText /> : <FileType2 />}
              {FORMAT_INFO[f].label}
            </button>
          ))}
        </div>

        {items && items.length > 1 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm font-extrabold text-wolf">
              <span data-testid="report-count">
                {chosen.length} de {items.length} seleccionados
              </span>
              <span className="flex gap-3">
                <button type="button" className="text-macaw hover:underline" onClick={() => setSelected(new Set(items.map((i) => i.id)))}>
                  Todos
                </button>
                <button type="button" className="text-macaw hover:underline" onClick={() => setSelected(new Set())}>
                  Ninguno
                </button>
              </span>
            </div>
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border-2 border-swan p-1.5" aria-label="Elementos del reporte">
              {items.map((item) => (
                <li key={item.id}>
                  <label className={clsx('flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-extrabold', selected.has(item.id) ? 'bg-macaw-light/60' : 'hover:bg-polar')}>
                    <input
                      type="checkbox"
                      className="size-5 accent-[#1cb0f6]"
                      checked={selected.has(item.id)}
                      onChange={() => {
                        const next = new Set(selected);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        setSelected(next);
                      }}
                    />
                    <span className="truncate">{itemLabel?.(item) ?? item.id}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {optionLabel && (
          <label className={clsx('flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-sm font-extrabold', option ? 'border-feather/60 bg-feather-light/50' : 'border-swan')}>
            <input type="checkbox" className="size-5 accent-[#58cc02]" checked={option} onChange={(e) => setOption(e.target.checked)} />
            {optionLabel}
          </label>
        )}

        <Button block size="lg" loading={busy} icon={<Download className="size-6" />} onClick={run}>
          Descargar {FORMAT_INFO[format].label}
        </Button>
      </div>
    </Modal>
  );
}
