import clsx from 'clsx';
import { BrainCircuit, Gauge, History, Sparkles, Trash2, WifiOff } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { formatNumber, timeAgo } from '../lib/format';
import { analyzeOffline, type OfflineAnalysis } from '../lib/offline-analysis';
import type { Analysis, OnlineAnalysisContent } from '../lib/types';
import { useSettings } from '../settings/SettingsContext';
import { errorMessage, useFeedback } from './feedback';
import { Badge, Button, Card, IconButton } from './ui';

interface Props {
  targetType: 'group' | 'scan';
  targetId: number;
  /** Texto completo, necesario para el análisis sin conexión. */
  text: string;
}

export function AnalysisPanel({ targetType, targetId, text }: Props) {
  const { settings } = useSettings();
  const { toast, confirm } = useFeedback();
  const [history, setHistory] = useState<Analysis[]>([]);
  const [selected, setSelected] = useState<Analysis | null>(null);
  const [running, setRunning] = useState<'online' | 'offline' | null>(null);

  useEffect(() => {
    api.analyses
      .list(targetType, targetId)
      .then((r) => {
        setHistory(r.analyses);
        setSelected(r.analyses[0] ?? null);
      })
      .catch(() => {});
  }, [targetType, targetId]);

  const runOffline = async () => {
    setRunning('offline');
    const content = analyzeOffline(text);
    const local: Analysis = { id: -Date.now(), targetType, targetId, mode: 'offline', content, createdAt: new Date().toISOString() };
    try {
      const { analysis } = await api.analyses.saveOffline(targetType, targetId, content);
      setHistory((h) => [analysis, ...h]);
      setSelected(analysis);
    } catch {
      // Sin conexión: se muestra igualmente, aunque no quede guardado.
      setSelected(local);
      toast('Análisis listo (no se guardó porque no hay conexión)', 'info');
    } finally {
      setRunning(null);
    }
  };

  const runOnline = async () => {
    setRunning('online');
    try {
      const { analysis } = await api.analyses.online(targetType, targetId);
      setHistory((h) => [analysis, ...h]);
      setSelected(analysis);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setRunning(null);
    }
  };

  const remove = async (a: Analysis) => {
    if (!(await confirm({ title: '¿Borrar análisis?', message: 'Esta acción no se puede deshacer.', confirmLabel: 'Borrar', danger: true }))) return;
    await api.analyses.remove(a.id).catch(() => {});
    const rest = history.filter((h) => h.id !== a.id);
    setHistory(rest);
    setSelected(rest[0] ?? null);
  };

  const tooShort = text.trim().length < 20;

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-beetle-light text-beetle-dark">
          <BrainCircuit className="size-6" />
        </div>
        <div>
          <h2 className="text-lg font-black">Análisis del texto</h2>
          <p className="text-sm text-wolf">Resumen, temas y estadísticas de lo escaneado.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button variant="plain" icon={<Gauge className="size-5" />} loading={running === 'offline'} disabled={tooShort || running !== null} onClick={runOffline}>
          Rápido (sin conexión)
        </Button>
        <Button
          variant="secondary"
          icon={<Sparkles className="size-5" />}
          loading={running === 'online'}
          disabled={tooShort || running !== null || !settings.keys.gemini.configured}
          onClick={runOnline}
          title={!settings.keys.gemini.configured ? 'Configura tu API key de Gemini en Ajustes' : undefined}
        >
          Con IA (Gemini)
        </Button>
      </div>
      {tooShort && <p className="mt-3 text-sm text-wolf">Se necesita más texto para analizar.</p>}

      {history.length > 1 && (
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
          <History className="size-4 shrink-0 text-hare" />
          {history.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              className={clsx(
                'shrink-0 rounded-xl border-2 px-3 py-1 text-xs font-extrabold',
                selected?.id === a.id ? 'border-macaw bg-macaw-light text-macaw-dark' : 'border-swan text-wolf',
              )}
            >
              {a.mode === 'online' ? 'IA' : 'Rápido'} · {timeAgo(a.createdAt)}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-6 border-t-2 border-swan pt-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selected.mode === 'online' ? <Badge tone="purple">Gemini</Badge> : <Badge tone="gray"><WifiOff className="size-3" /> Sin conexión</Badge>}
              <span className="text-xs font-bold text-hare">{timeAgo(selected.createdAt)}</span>
            </div>
            {selected.id > 0 && (
              <IconButton label="Borrar análisis" onClick={() => remove(selected)} className="hover:text-cardinal">
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </div>
          {selected.mode === 'online' ? (
            <OnlineView a={selected.content as OnlineAnalysisContent} />
          ) : (
            <OfflineView a={selected.content as OfflineAnalysis} />
          )}
        </div>
      )}
    </Card>
  );
}

function Section({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={clsx('space-y-2', wide && 'md:col-span-2')}>
      <h3 className="text-sm font-black uppercase tracking-wide text-hare">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-swan p-3">
      <div className="text-xl font-black">{value}</div>
      <div className="text-xs font-bold text-wolf">{label}</div>
    </div>
  );
}

function OfflineView({ a }: { a: OfflineAnalysis }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:col-span-2">
        <Stat label="Palabras" value={formatNumber(a.palabras)} />
        <Stat label="Oraciones" value={formatNumber(a.oraciones)} />
        <Stat label="Min. de lectura" value={a.minutosLectura} />
        <Stat label="Diversidad léxica" value={`${a.diversidadLexica}%`} />
      </div>
      <Section title="Legibilidad">
        <div className="flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-swan">
            <div className="h-full rounded-full bg-macaw" style={{ width: `${a.legibilidad.puntaje}%` }} />
          </div>
          <span className="text-sm font-extrabold">
            {a.legibilidad.nivel} ({a.legibilidad.puntaje})
          </span>
        </div>
        <p className="text-xs text-wolf">Índice Fernández Huerta · {a.promedioPalabrasPorOracion} palabras por oración en promedio.</p>
      </Section>
      {a.palabrasClave.length > 0 && (
        <Section title="Palabras clave">
          <div className="flex flex-wrap gap-2">
            {a.palabrasClave.map((k) => (
              <span key={k.palabra} className="rounded-xl bg-polar px-3 py-1 text-sm font-bold">
                {k.palabra} <span className="text-hare">×{k.veces}</span>
              </span>
            ))}
          </div>
        </Section>
      )}
      {a.resumen.length > 0 && (
        <Section title="Frases principales" wide>
          <ul className="space-y-2">
            {a.resumen.map((s, i) => (
              <li key={i} className="rounded-2xl bg-polar p-3 text-sm leading-relaxed">
                {s}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 leading-relaxed">
          <span className="mt-2 size-2 shrink-0 rounded-full bg-feather" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function OnlineView({ a }: { a: OnlineAnalysisContent }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {a.truncated && (
        <div className="md:col-span-2">
          <Badge tone="yellow">El texto era muy largo: se analizó la primera parte</Badge>
        </div>
      )}
      <Section title="Resumen" wide>
        <p className="whitespace-pre-line leading-relaxed">{a.resumen}</p>
      </Section>
      {a.temas?.length > 0 && (
        <Section title="Temas">
          <div className="flex flex-wrap gap-2">
            {a.temas.map((t) => (
              <Badge key={t} tone="blue" className="normal-case">
                {t}
              </Badge>
            ))}
          </div>
        </Section>
      )}
      {a.ideasClave?.length > 0 && (
        <Section title="Ideas clave">
          <List items={a.ideasClave} />
        </Section>
      )}
      {a.entidades?.length > 0 && (
        <Section title="Personas, lugares y obras">
          <div className="flex flex-wrap gap-2">
            {a.entidades.map((e) => (
              <span key={`${e.nombre}-${e.tipo}`} className="rounded-xl bg-polar px-3 py-1 text-sm font-bold">
                {e.nombre} <span className="font-semibold text-hare">· {e.tipo}</span>
              </span>
            ))}
          </div>
        </Section>
      )}
      {a.vocabulario?.length > 0 && (
        <Section title="Vocabulario" wide>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {a.vocabulario.map((v) => (
              <div key={v.termino} className="rounded-2xl bg-polar p-3">
                <dt className="font-extrabold">{v.termino}</dt>
                <dd className="text-sm text-wolf">{v.definicion}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {a.preguntas?.length > 0 && (
        <Section title="Preguntas de repaso">
          <List items={a.preguntas} />
        </Section>
      )}
      <Section title="Tono">
        <p>{a.tono}</p>
      </Section>
      <Section title="Calidad del OCR">
        <p className="text-sm text-wolf">{a.calidadOcr}</p>
      </Section>
    </div>
  );
}
