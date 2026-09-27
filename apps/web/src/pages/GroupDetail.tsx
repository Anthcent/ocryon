import clsx from 'clsx';
import { ArrowLeft, BookOpen, BookOpenText, BrainCircuit, ChevronLeft, ChevronRight, Clock, Copy, Download, FileText, LayoutGrid, Pencil, Plus, Trash2, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import type React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ActionTile, LessonProgress } from '../components/ActionTile';
import { BookCover } from '../components/BookCover';
import { BookViewer } from '../components/BookViewer';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { errorMessage, useFeedback } from '../components/feedback';
import { Reader } from '../components/Reader';
import { Button, EmptyState, PageLoader, Segmented } from '../components/ui';
import { api } from '../lib/api';
import { categoryEmoji, GROUP_STYLES } from '../lib/constants';
import { copyText, downloadText, formatDate, formatNumber } from '../lib/format';
import type { Group, Scan } from '../lib/types';
import { GroupFormModal } from './Catalog';

type Tab = 'paginas' | 'leer' | 'analisis';

export function GroupDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [group, setGroup] = useState<Group | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [tab, setTab] = useState<Tab>('paginas');
  const [editing, setEditing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // «?libro=1» abre directamente el modo libro (desde el catálogo).
  const [params, setParams] = useSearchParams();
  const bookOpen = params.get('libro') === '1';
  const setBookOpen = (open: boolean) => setParams(open ? { libro: '1' } : {}, { replace: true });

  useEffect(() => {
    api.groups
      .get(id)
      .then((r) => {
        setGroup(r.group);
        setScans(r.scans);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) {
    return (
      <EmptyState icon={<BookOpen className="size-10" />} title="Grupo no encontrado" action={<Link to="/catalogo"><Button>Volver al catálogo</Button></Link>} />
    );
  }
  if (!group) return <PageLoader />;

  const style = GROUP_STYLES[group.color];
  const fullText = scans.map((s) => s.text).join('\n\n');
  const words = scans.reduce((sum, s) => sum + s.wordCount, 0);
  const minutes = Math.max(1, Math.round(words / 200));
  const addPages = () => navigate(`/escanear?grupo=${group.id}`);

  const move = async (index: number, delta: number) => {
    const next = [...scans];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setScans(next);
    try {
      await api.groups.reorder(group.id, next.map((s) => s.id));
    } catch (err) {
      toast(errorMessage(err), 'error');
      setScans(scans);
    }
  };

  const removeScan = async (scan: Scan) => {
    const ok = await confirm({ title: '¿Borrar esta página?', message: `Se borrará «${scan.title}» y su texto.`, confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    try {
      await api.scans.remove(scan.id);
      setScans((s) => s.filter((x) => x.id !== scan.id));
      toast('Página borrada');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const removeGroup = async () => {
    const ok = await confirm({
      title: '¿Borrar el grupo?',
      message: `Se borrarán «${group.title}» y sus ${scans.length} páginas. Esta acción no se puede deshacer.`,
      confirmLabel: 'Borrar todo',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.groups.remove(group.id);
      toast('Grupo borrado');
      navigate('/catalogo', { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const copyAll = async () => {
    try {
      await copyText(fullText);
      toast('Texto copiado');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const openAnalysis = () => {
    setTab('analisis');
    document.getElementById('group-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const exportTxt = () => downloadText(`${group.title}.txt`, fullText);
  const progress = group.totalPages ? Math.min(100, (scans.length / group.totalPages) * 100) : null;

  return (
    <div className="space-y-6">
      <Link to="/catalogo" className="inline-flex items-center gap-1 text-sm font-extrabold uppercase text-hare hover:text-wolf">
        <ArrowLeft className="size-4" /> Catálogo
      </Link>

      {/* Portada: libro en 3D, datos y acciones principales */}
      <section className={clsx('relative overflow-hidden rounded-[2rem] border-2 border-b-[6px] p-5 sm:p-8', style.soft, style.border)}>
        <span className={clsx('pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-20', style.bg)} />
        <span className={clsx('pointer-events-none absolute -bottom-20 right-24 size-40 rounded-full opacity-10', style.bg)} />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <BookCover group={group} size="lg" className="mx-auto sm:mx-0" />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              {group.category && (
                <span className={clsx('rounded-xl px-2.5 py-1 text-xs font-extrabold text-white', style.bg)}>
                  {categoryEmoji(group.category)} {group.category}
                </span>
              )}
              <span className="rounded-xl bg-white px-2.5 py-1 text-xs font-extrabold text-wolf">Creado el {formatDate(group.createdAt)}</span>
            </div>
            <h1 className="mt-3 text-3xl font-black leading-tight text-eel sm:text-4xl">{group.title}</h1>
            {group.author && <p className={clsx('mt-1 text-lg font-extrabold', style.text)}>de {group.author}</p>}
            {group.description && <p className="mt-2 line-clamp-3 text-wolf">{group.description}</p>}

            <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-md">
              <Stat icon={<FileText />} tone="text-macaw bg-macaw-light" value={scans.length} label={scans.length === 1 ? 'página' : 'páginas'} />
              <Stat icon={<Type />} tone="text-fox bg-fox-light" value={formatNumber(words)} label="palabras" />
              <Stat icon={<Clock />} tone="text-beetle-dark bg-beetle-light" value={minutes} label="min lectura" />
            </div>

            {progress !== null && (
              <div className="mt-4 rounded-2xl bg-white p-3 sm:max-w-md">
                <div className="mb-1.5 flex items-center justify-between text-sm font-extrabold">
                  <span>{progress >= 100 ? '🎉 ¡Libro completo!' : 'Avance del libro'}</span>
                  <span className="text-wolf">
                    {scans.length} / {group.totalPages}
                  </span>
                </div>
                <LessonProgress value={progress} />
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              {scans.length > 0 && (
                <Button size="lg" icon={<BookOpenText className="size-6" />} onClick={() => setBookOpen(true)}>
                  Abrir en modo libro
                </Button>
              )}
              <Button size="lg" variant="secondary" icon={<Plus className="size-6" />} onClick={addPages}>
                Añadir páginas
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Acciones rápidas (móvil y tablet); en escritorio van en la columna lateral */}
      <div className="grid grid-cols-4 gap-2 lg:hidden">
        <ActionTile icon={<Download />} label="Exportar .txt" shortLabel=".txt" tone="blue" disabled={!scans.length} onClick={exportTxt} compact />
        <ActionTile icon={<Copy />} label="Copiar" tone="purple" disabled={!scans.length} onClick={copyAll} compact />
        <ActionTile icon={<Pencil />} label="Editar grupo" shortLabel="Editar" tone="orange" onClick={() => setEditing(true)} compact />
        <ActionTile icon={<Trash2 />} label="Borrar grupo" shortLabel="Borrar" tone="red" onClick={removeGroup} compact />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0 space-y-4" id="group-tabs">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'paginas', label: 'Páginas', icon: <LayoutGrid className="size-5" /> },
              { value: 'leer', label: 'Leer', icon: <BookOpenText className="size-5" /> },
              { value: 'analisis', label: 'Análisis', icon: <BrainCircuit className="size-5" /> },
            ]}
          />

          {tab === 'paginas' &&
            (scans.length === 0 ? (
              <EmptyState
                icon={<FileText className="size-10" />}
                title="Este grupo está vacío"
                action={
                  <Button icon={<Plus className="size-5" />} onClick={addPages}>
                    Añadir páginas
                  </Button>
                }
              >
                Escanea las hojas de tu libro y aparecerán aquí en orden.
              </EmptyState>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                {scans.map((s, i) => (
                  <div
                    key={s.id}
                    className="group flex flex-col overflow-hidden rounded-2xl border-2 border-b-4 border-swan bg-white transition hover:-translate-y-0.5 hover:border-macaw/50 hover:shadow-lg"
                  >
                    <span className={clsx('h-1.5', style.bg)} />
                    <Link to={`/escaneo/${s.id}`} className="flex flex-1 flex-col p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-full text-base font-black text-white shadow-sm', style.bg)}>{i + 1}</span>
                        {s.pageLabel ? (
                          <span className="rounded-lg bg-feather-light px-2 py-0.5 text-xs font-extrabold text-feather-dark">pág. {s.pageLabel}</span>
                        ) : (
                          <span className="text-xs font-bold text-hare">{formatNumber(s.wordCount)} pal.</span>
                        )}
                      </div>
                      <div className="truncate text-sm font-extrabold group-hover:text-macaw">{s.title}</div>
                      {/* Vista previa como una mini página */}
                      <p className="mt-1.5 line-clamp-5 rounded-lg bg-[#fffdf6] p-2 font-serif text-xs leading-relaxed text-wolf">{s.text || 'Sin texto'}</p>
                    </Link>
                    <div className="flex items-center justify-between border-t-2 border-swan px-1 py-1">
                      <button
                        type="button"
                        aria-label="Mover antes"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className="flex size-9 items-center justify-center rounded-xl text-wolf hover:bg-polar disabled:opacity-30"
                      >
                        <ChevronLeft className="size-5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Borrar página"
                        onClick={() => removeScan(s)}
                        className="flex size-9 items-center justify-center rounded-xl text-hare hover:bg-cardinal-light hover:text-cardinal"
                      >
                        <Trash2 className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Mover después"
                        disabled={i === scans.length - 1}
                        onClick={() => move(i, 1)}
                        className="flex size-9 items-center justify-center rounded-xl text-wolf hover:bg-polar disabled:opacity-30"
                      >
                        <ChevronRight className="size-5" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addPages}
                  className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-hare text-wolf transition hover:border-feather hover:bg-feather-light hover:text-feather-dark"
                >
                  <span className="flex size-12 items-center justify-center rounded-full bg-feather text-white shadow-[0_3px_0_#58a700]">
                    <Plus className="size-7" />
                  </span>
                  <span className="text-sm font-extrabold uppercase">Añadir páginas</span>
                </button>
              </div>
            ))}

          {tab === 'leer' && <Reader pages={scans} />}

          {tab === 'analisis' && <AnalysisPanel targetType="group" targetId={group.id} text={fullText} />}
        </div>

        {/* Columna lateral (escritorio): opciones y detalles */}
        <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block">
          <div className="overflow-hidden rounded-3xl border-2 border-swan bg-white">
            <div className="border-b-2 border-swan px-4 py-3 text-sm font-black uppercase tracking-wide text-hare">Opciones</div>
            <OptionRow icon={<Download />} tone="bg-macaw-light text-macaw-dark" label="Exportar .txt" name="Exportar .txt" disabled={!scans.length} onClick={exportTxt} />
            <OptionRow icon={<Copy />} tone="bg-beetle-light text-beetle-dark" label="Copiar todo el texto" name="Copiar" disabled={!scans.length} onClick={copyAll} />
            <OptionRow icon={<BrainCircuit />} tone="bg-bee-light text-bee-dark" label="Analizar el libro" name="Analizar" disabled={!scans.length} onClick={openAnalysis} />
            <OptionRow icon={<Pencil />} tone="bg-fox-light text-fox-dark" label="Editar datos del libro" name="Editar grupo" onClick={() => setEditing(true)} />
            <OptionRow icon={<Trash2 />} tone="bg-cardinal-light text-cardinal-dark" label="Borrar grupo" name="Borrar grupo" danger onClick={removeGroup} />
          </div>
          <div className="rounded-3xl border-2 border-swan bg-white p-4">
            <div className="mb-3 text-sm font-black uppercase tracking-wide text-hare">Detalles</div>
            <dl className="space-y-2.5 text-sm">
              <Detail label="Autor" value={group.author || '—'} />
              <Detail label="Categoría" value={group.category ? `${categoryEmoji(group.category)} ${group.category}` : '—'} />
              <Detail label="Páginas del libro" value={group.totalPages ? String(group.totalPages) : '—'} />
              <Detail label="Hojas escaneadas" value={String(scans.length)} />
              <Detail label="Palabras" value={formatNumber(words)} />
              <Detail label="Actualizado" value={formatDate(group.updatedAt)} />
            </dl>
          </div>
        </aside>
      </div>

      {bookOpen && scans.length > 0 && <BookViewer group={group} pages={scans} onClose={() => setBookOpen(false)} />}

      <GroupFormModal open={editing} onClose={() => setEditing(false)} group={group} onSaved={setGroup} />
    </div>
  );
}

function Stat({ icon, tone, value, label }: { icon: React.ReactNode; tone: string; value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border-2 border-b-4 border-swan bg-white px-2 py-2.5">
      <span className={clsx('flex size-8 items-center justify-center rounded-lg [&>svg]:size-4', tone)}>{icon}</span>
      <span className="text-lg font-black leading-none">{value}</span>
      <span className="text-[11px] font-bold text-wolf">{label}</span>
    </div>
  );
}

function OptionRow({
  icon,
  tone,
  label,
  name,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  /** Nombre accesible corto (igual que en las fichas de móvil). */
  name?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={name ?? label}
      className={clsx(
        'flex w-full items-center gap-3 border-b-2 border-swan px-4 py-3 text-left font-extrabold transition last:border-b-0 hover:bg-polar disabled:opacity-40',
        danger && 'text-cardinal-dark',
      )}
    >
      <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl [&>svg]:size-5', tone)}>{icon}</span>
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-5 text-hare" />
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-bold text-hare">{label}</dt>
      <dd className="truncate font-extrabold">{value}</dd>
    </div>
  );
}
