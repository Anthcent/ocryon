import clsx from 'clsx';
import { Download, FileScan, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage, useFeedback } from '../components/feedback';
import { Button, Card, EmptyState, Input, PageLoader } from '../components/ui';
import { documentsToCsv, downloadFile, TemplateModal, useDocTemplates } from '../documents/shared';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { SavedDocument } from '../lib/types';

export function DocumentsPage() {
  const { toast, confirm } = useFeedback();
  const { templates, custom, reload } = useDocTemplates();
  const [docs, setDocs] = useState<SavedDocument[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [template, setTemplate] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [creatingType, setCreatingType] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let alive = true;
    api.documents
      .list({ template: template ?? undefined, q: debounced || undefined })
      .then((r) => {
        if (!alive) return;
        setDocs(r.documents);
        setCounts(Object.fromEntries(r.counts.map((c) => [c.templateKey, c.count])));
      })
      .catch((err) => {
        if (alive) {
          setDocs([]);
          toast(errorMessage(err), 'error');
        }
      });
    return () => {
      alive = false;
    };
  }, [template, debounced, toast]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  // Tipos con documentos primero; los tipos borrados siguen apareciendo si tienen documentos.
  const chips = useMemo(() => {
    const known = templates.map((t) => ({ key: t.key, name: t.name, emoji: t.emoji }));
    const orphan = Object.keys(counts)
      .filter((k) => !known.some((t) => t.key === k))
      .map((k) => ({ key: k, name: docs?.find((d) => d.templateKey === k)?.templateName ?? 'Otro', emoji: '📄' }));
    return [...known, ...orphan].filter((t) => counts[t.key]).sort((a, b) => (counts[b.key] ?? 0) - (counts[a.key] ?? 0));
  }, [templates, counts, docs]);

  const selected = chips.find((c) => c.key === template);

  const removeType = async (id: number, name: string) => {
    const ok = await confirm({
      title: `¿Borrar el tipo «${name}»?`,
      message: 'Los documentos ya guardados de este tipo se conservan.',
      confirmLabel: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.documents.removeTemplate(id);
      await reload();
      toast('Tipo borrado');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  return (
    <div>
      <div className="relative mb-5 overflow-hidden rounded-3xl border-b-[5px] border-cardinal-dark bg-gradient-to-br from-cardinal via-[#ff6b9a] to-beetle px-4 py-3 text-white sm:px-6 sm:py-4">
        <FileScan className="pointer-events-none absolute -bottom-6 right-44 size-28 text-white/15" />
        <div className="relative flex items-center gap-3 sm:gap-5">
          <div className="min-w-0">
            <h1 className="text-xl font-black leading-tight sm:text-2xl">Tus documentos</h1>
            <p className="hidden text-sm font-bold text-white/90 sm:block">Escanea y los datos se llenan solos en un formulario.</p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-xl bg-white/25 px-2.5 py-1 text-sm font-black backdrop-blur md:inline-flex">
            📑 {total} <span className="text-xs font-extrabold uppercase text-white/85">guardados</span>
          </span>
          <Link
            to="/documentos/nuevo"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-2xl border-2 border-b-4 border-macaw-dark bg-macaw px-3 py-2 text-xs font-extrabold uppercase text-white shadow-sm transition hover:brightness-110 active:translate-y-[2px] active:border-b-2 sm:px-4 sm:text-sm"
          >
            <Plus className="size-5" strokeWidth={3} /> Nuevo documento
          </Link>
        </div>
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-hare" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, número, RUC, cliente…" aria-label="Buscar documentos" className="pl-12" />
        {query && (
          <button type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-hare hover:text-eel">
            <X className="size-5" />
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por tipo">
            <TypeChip selected={template === null} onClick={() => setTemplate(null)} emoji="✨" label="Todos" count={total} />
            {chips.map((c) => (
              <TypeChip key={c.key} selected={template === c.key} onClick={() => setTemplate(template === c.key ? null : c.key)} emoji={c.emoji} label={c.name} count={counts[c.key]} />
            ))}
          </div>
          {selected && docs && docs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Download className="size-4" />}
              onClick={() => downloadFile(`${selected.name}.csv`, documentsToCsv(docs), 'text/csv;charset=utf-8')}
            >
              Exportar CSV
            </Button>
          )}
        </div>
      )}

      {!docs ? (
        <PageLoader />
      ) : docs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileScan className="size-10" />}
            title={debounced || template ? 'Ningún documento coincide' : 'Aún no tienes documentos'}
            action={
              !debounced && (
                <Link to="/documentos/nuevo">
                  <Button icon={<Plus className="size-5" />}>Escanear documento</Button>
                </Link>
              )
            }
          >
            {debounced || template
              ? 'Prueba con otra palabra o quita el filtro.'
              : 'Escanea facturas, recibos, DNI o contratos: Ocryon detecta los datos y los guarda en un formulario.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {docs.map((d) => (
            <DocumentCard key={d.id} doc={d} emoji={templates.find((t) => t.key === d.templateKey)?.emoji ?? '📄'} />
          ))}
        </div>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black">Tipos de documento</h2>
          <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setCreatingType(true)}>
            Crear tipo
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <div key={t.key} className="flex items-center gap-3 rounded-2xl border-2 border-swan bg-white p-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-polar text-2xl" aria-hidden>
                {t.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-extrabold">{t.name}</div>
                <div className="truncate text-xs font-bold text-hare">{t.fields.map((f) => f.label).join(' · ')}</div>
              </div>
              {t.custom && t.id ? (
                <button
                  type="button"
                  aria-label={`Borrar tipo ${t.name}`}
                  onClick={() => removeType(t.id!, t.name)}
                  className="rounded-xl p-2 text-hare hover:bg-cardinal-light hover:text-cardinal"
                >
                  <Trash2 className="size-5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {custom.length === 0 && <p className="mt-2 text-sm font-bold text-hare">¿Tu documento no está? Crea un tipo con los campos que necesitas.</p>}
      </section>

      <TemplateModal open={creatingType} onClose={() => setCreatingType(false)} onCreated={() => void reload()} />
    </div>
  );
}

function TypeChip({ selected, onClick, emoji, label, count }: { selected: boolean; onClick: () => void; emoji: string; label: string; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-2xl border-2 border-b-4 px-3 py-1.5 text-sm font-extrabold transition active:translate-y-[2px] active:border-b-2',
        selected ? 'border-cardinal bg-cardinal-light text-cardinal-dark' : 'border-swan bg-white text-wolf hover:bg-polar',
      )}
    >
      <span aria-hidden>{emoji}</span>
      {label}
      {count !== undefined && <span className={clsx('rounded-md px-1.5 text-xs', selected ? 'bg-cardinal text-white' : 'bg-polar')}>{count}</span>}
    </button>
  );
}

function DocumentCard({ doc, emoji }: { doc: SavedDocument; emoji: string }) {
  const filled = doc.fields.filter((f) => f.value.trim());
  return (
    <Link to={`/documentos/${doc.id}`} className="block">
      <Card interactive className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cardinal-light text-2xl" aria-hidden>
            {emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-extrabold">{doc.title}</div>
            <div className="truncate text-xs font-bold text-hare">
              {doc.templateName} · {timeAgo(doc.createdAt)}
            </div>
          </div>
        </div>
        <dl className="flex-1 space-y-1 text-sm">
          {filled.slice(0, 3).map((f) => (
            <div key={f.key} className="flex gap-2">
              <dt className="shrink-0 font-bold text-hare">{f.label}:</dt>
              <dd className="truncate font-extrabold text-eel">{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3">
          <LessonBar filled={filled.length} total={doc.fields.length} />
        </div>
      </Card>
    </Link>
  );
}

/** Cuántos campos del formulario tienen dato. */
function LessonBar({ filled, total }: { filled: number; total: number }) {
  const pct = total ? (filled / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-swan">
        <div className={clsx('h-full rounded-full', pct === 100 ? 'bg-feather' : 'bg-bee')} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-extrabold text-wolf">
        {filled}/{total} campos
      </span>
    </div>
  );
}
