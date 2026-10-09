import clsx from 'clsx';
import { Download, FileText, FileType2, ScrollText } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { exportFile, FORMAT_INFO, pagesModel, type ExportFormat, type ExportPage, type PageExportOptions } from '../lib/export';
import { errorMessage, useFeedback } from './feedback';
import { Button, Modal, Segmented } from './ui';

const PREFS_KEY = 'ocryon:export-prefs';
const DEFAULT_OPTIONS: PageExportOptions = { cover: true, pageBreaks: true, reflow: true, headings: true };

function loadPrefs(): { format: ExportFormat; options: PageExportOptions } {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    if (saved && saved.format in FORMAT_INFO) return { format: saved.format, options: { ...DEFAULT_OPTIONS, ...saved.options } };
  } catch {
    // sin almacenamiento: valores por defecto
  }
  return { format: 'pdf', options: DEFAULT_OPTIONS };
}

/** «1-3, 7, 10-» → posiciones 0..n-1 seleccionadas (las páginas se numeran desde 1). */
export function parseRange(input: string, total: number): Set<number> {
  const picked = new Set<number>();
  for (const part of input.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/) ?? part.match(/^(\d+)$/);
    if (!m) continue;
    const from = Number(m[1] || 1);
    const to = m[2] === undefined ? from : Number(m[2] || total);
    for (let n = Math.max(1, Math.min(from, to)); n <= Math.min(total, Math.max(from, to)); n++) picked.add(n - 1);
  }
  return picked;
}

export interface ExportablePage extends ExportPage {
  id: number;
}

const FORMATS: { value: ExportFormat; label: string; hint: string; icon: ReactNode; tone: string }[] = [
  { value: 'docx', label: 'Word', hint: 'Editable (.docx)', icon: <FileText />, tone: 'border-macaw bg-macaw-light text-macaw-dark' },
  { value: 'pdf', label: 'PDF', hint: 'Para imprimir o enviar', icon: <FileType2 />, tone: 'border-cardinal bg-cardinal-light text-cardinal-dark' },
  { value: 'txt', label: 'Texto', hint: 'Solo el texto (.txt)', icon: <ScrollText />, tone: 'border-hare bg-polar text-eel' },
];

/**
 * Exportar páginas a Word, PDF o texto: todas o solo las elegidas (con casillas o un rango
 * como «1-5, 8»), con portada, una hoja por página y párrafos reconstruidos.
 */
export function ExportModal({
  open,
  onClose,
  title,
  subtitle,
  meta = [],
  pages,
  fileName,
  initialSelection,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  meta?: [string, string][];
  pages: ExportablePage[];
  fileName: string;
  /** Ids preseleccionados (si no, todas). */
  initialSelection?: number[];
}) {
  const { toast } = useFeedback();
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [options, setOptions] = useState<PageExportOptions>(DEFAULT_OPTIONS);
  const [mode, setMode] = useState<'todas' | 'elegir'>('todas');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [range, setRange] = useState('');
  const [busy, setBusy] = useState(false);
  const multi = pages.length > 1;

  useEffect(() => {
    if (!open) return;
    const prefs = loadPrefs();
    setFormat(prefs.format);
    setOptions(prefs.options);
    const initial = initialSelection?.length ? new Set(initialSelection) : new Set(pages.map((p) => p.id));
    setSelected(initial);
    setMode(initialSelection?.length && initialSelection.length < pages.length ? 'elegir' : 'todas');
    setRange('');
    // Solo al abrir: las páginas no cambian mientras el diálogo está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chosen = useMemo(() => (mode === 'todas' ? pages : pages.filter((p) => selected.has(p.id))), [mode, pages, selected]);

  const applyRange = (value: string) => {
    setRange(value);
    if (!value.trim()) return;
    const idx = parseRange(value, pages.length);
    setSelected(new Set(pages.filter((_, i) => idx.has(i)).map((p) => p.id)));
  };

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setRange('');
  };

  const run = async () => {
    if (chosen.length === 0) return toast('Elige al menos una página', 'error');
    setBusy(true);
    try {
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ format, options }));
      } catch {
        // preferencia opcional
      }
      const partial = chosen.length < pages.length;
      const extraMeta: [string, string][] = multi ? [['Páginas', partial ? `${chosen.length} de ${pages.length}` : String(pages.length)]] : [];
      const model = pagesModel({
        fileName: partial ? `${fileName} (selección)` : fileName,
        title,
        subtitle,
        meta: [...meta, ...extraMeta],
        pages: chosen,
        options: format === 'txt' ? { ...options, cover: false, pageBreaks: false } : { ...options, cover: options.cover && multi },
      });
      const name = await exportFile(model, format);
      toast(`Listo: ${name}`);
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const set = (key: keyof PageExportOptions) => (value: boolean) => setOptions({ ...options, [key]: value });

  return (
    <Modal open={open} onClose={onClose} title="Exportar" wide>
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-hare">Formato</h3>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Formato">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={format === f.value}
                aria-label={f.label}
                onClick={() => setFormat(f.value)}
                className={clsx(
                  'flex flex-col items-center gap-1 rounded-2xl border-2 border-b-4 px-2 py-3 text-center transition active:translate-y-[2px] active:border-b-2 [&>svg]:size-7',
                  format === f.value ? f.tone : 'border-swan bg-white text-wolf hover:bg-polar',
                )}
              >
                {f.icon}
                <span className="font-black">{f.label}</span>
                <span className="hidden text-[11px] font-bold opacity-80 sm:block">{f.hint}</span>
              </button>
            ))}
          </div>
        </section>

        {multi && (
          <section>
            <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-hare">Páginas</h3>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'todas', label: `Todas (${pages.length})` },
                { value: 'elegir', label: 'Elegir páginas' },
              ]}
            />
            {mode === 'elegir' && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={range}
                    onChange={(e) => applyRange(e.target.value)}
                    placeholder="Rango, p. ej. 1-5, 8"
                    aria-label="Rango de páginas"
                    className="min-w-0 flex-1 rounded-xl border-2 border-swan bg-polar px-3 py-2 font-semibold outline-none focus:border-macaw focus:bg-white"
                  />
                  <Button size="sm" variant="plain" onClick={() => setSelected(new Set(pages.map((p) => p.id)))}>
                    Todas
                  </Button>
                  <Button size="sm" variant="plain" onClick={() => setSelected(new Set())}>
                    Ninguna
                  </Button>
                </div>
                <ul className="max-h-60 space-y-1 overflow-y-auto rounded-2xl border-2 border-swan p-1.5" aria-label="Páginas a exportar">
                  {pages.map((p, i) => (
                    <li key={p.id}>
                      <label className={clsx('flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5', selected.has(p.id) ? 'bg-macaw-light/60' : 'hover:bg-polar')}>
                        <input type="checkbox" className="size-5 accent-[#1cb0f6]" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Página ${i + 1}: ${p.title}`} />
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-polar text-xs font-black">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-extrabold">
                            {p.title}
                            {p.pageLabel && <span className="ml-1.5 text-xs font-bold text-feather-dark">pág. {p.pageLabel}</span>}
                          </span>
                          <span className="block truncate text-xs text-hare">{p.text.slice(0, 120) || 'Sin texto'}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-sm font-extrabold text-wolf" data-testid="export-count">
                  {chosen.length} de {pages.length} páginas seleccionadas
                </p>
              </div>
            )}
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-hare">Opciones</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {format !== 'txt' && multi && <Check label="Portada con los datos" checked={options.cover} onChange={set('cover')} />}
            {format !== 'txt' && multi && <Check label="Cada página en una hoja nueva" checked={options.pageBreaks} onChange={set('pageBreaks')} />}
            <Check label="Unir las líneas en párrafos" checked={options.reflow} onChange={set('reflow')} />
            <Check label="Título en cada página" checked={options.headings} onChange={set('headings')} />
          </div>
        </section>

        <Button block size="lg" loading={busy} icon={<Download className="size-6" />} onClick={run} disabled={chosen.length === 0}>
          Descargar {FORMAT_INFO[format].label}
          {multi ? ` (${chosen.length} ${chosen.length === 1 ? 'página' : 'páginas'})` : ''}
        </Button>
      </div>
    </Modal>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={clsx('flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-3 py-2.5 font-extrabold', checked ? 'border-feather/60 bg-feather-light/50' : 'border-swan')}>
      <input type="checkbox" className="size-5 accent-[#58cc02]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm">{label}</span>
    </label>
  );
}
