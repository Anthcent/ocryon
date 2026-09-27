import clsx from 'clsx';
import { ArrowLeft, BookOpen, BrainCircuit, ChevronLeft, ChevronRight, Copy, Download, FileText, FolderInput, Pencil, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ActionTile, LessonProgress } from '../components/ActionTile';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { errorMessage, useFeedback } from '../components/feedback';
import { Button, Card, EmptyState, Input, Modal, PageLoader, Segmented, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { ENGINE_LABEL, GROUP_STYLES, LANGUAGES } from '../lib/constants';
import { copyText, downloadText, formatDate, formatNumber } from '../lib/format';
import type { Group, Scan } from '../lib/types';

type Tab = 'texto' | 'analisis';

export function ScanDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [scan, setScan] = useState<Scan | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>('texto');
  const [moving, setMoving] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [siblings, setSiblings] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  /** Páginas del mismo grupo, para navegar a la anterior / siguiente. */
  const loadSiblings = (groupId: number | null) => {
    if (!groupId) return setSiblings([]);
    api.groups.get(groupId).then((r) => setSiblings(r.scans.map((s) => s.id))).catch(() => setSiblings([]));
  };

  useEffect(() => {
    setScan(null);
    setEditing(false);
    api.scans
      .get(id)
      .then(({ scan }) => {
        setScan(scan);
        setTitle(scan.title);
        setText(scan.text);
        loadSiblings(scan.groupId);
      })
      .catch(() => setNotFound(true));
    api.groups.list().then((r) => setGroups(r.groups)).catch(() => {});
  }, [id]);

  if (notFound) {
    return <EmptyState icon={<FileText className="size-10" />} title="Escaneo no encontrado" action={<Link to="/catalogo"><Button>Volver al catálogo</Button></Link>} />;
  }
  if (!scan) return <PageLoader />;

  const dirty = title !== scan.title || text !== scan.text;
  const index = siblings.indexOf(scan.id);
  const prev = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
  const group = groups.find((g) => g.id === scan.groupId);
  const language = LANGUAGES.find((l) => l.code === scan.language)?.label ?? scan.language;

  const save = async () => {
    setSaving(true);
    try {
      const { scan: updated } = await api.scans.update(scan.id, { title, text });
      setScan(updated);
      setEditing(false);
      toast('Cambios guardados');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setTitle(scan.title);
    setText(scan.text);
    setEditing(false);
  };

  const moveTo = async (groupId: number | null) => {
    setMoving(false);
    try {
      const { scan: updated } = await api.scans.update(scan.id, { groupId });
      setScan(updated);
      loadSiblings(updated.groupId);
      toast(updated.groupTitle ? `Movido a «${updated.groupTitle}»` : 'Ahora es un escaneo individual');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: '¿Borrar escaneo?', message: 'Se borrará el texto y sus análisis.', confirmLabel: 'Borrar', danger: true }))) return;
    try {
      await api.scans.remove(scan.id);
      toast('Escaneo borrado');
      navigate(scan.groupId ? `/catalogo/grupo/${scan.groupId}` : '/catalogo?vista=individuales', { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const copy = async () => {
    try {
      await copyText(scan.text);
      toast('Texto copiado');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const startEdit = () => {
    setTab('texto');
    setEditing(true);
  };

  const actions = (compact: boolean) => (
    <>
      <ActionTile icon={<Pencil />} label="Editar" tone="blue" onClick={startEdit} disabled={editing} compact={compact} />
      <ActionTile icon={<Copy />} label="Copiar" tone="purple" onClick={copy} compact={compact} />
      <ActionTile icon={<Download />} label="Descargar" shortLabel=".txt" tone="green" onClick={() => downloadText(`${scan.title || 'escaneo'}.txt`, scan.text)} compact={compact} />
      <ActionTile icon={<FolderInput />} label="Mover" tone="orange" onClick={() => setMoving(true)} compact={compact} />
      <ActionTile icon={<Trash2 />} label="Borrar" tone="red" onClick={remove} compact={compact} />
    </>
  );

  return (
    <div className="space-y-5">
      {/* Navegación: volver y, si es parte de un grupo, avance por sus páginas */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={scan.groupId ? `/catalogo/grupo/${scan.groupId}` : '/catalogo?vista=individuales'}
          className="inline-flex min-w-0 items-center gap-1 text-sm font-extrabold uppercase text-hare hover:text-wolf"
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span className="max-w-48 truncate">{scan.groupTitle ?? 'Individuales'}</span>
        </Link>
        {siblings.length > 1 && (
          <div className="flex min-w-60 flex-1 items-center gap-2">
            <RoundNav label="Página anterior" disabled={!prev} onClick={() => prev && navigate(`/escaneo/${prev}`)}>
              <ChevronLeft className="size-5" />
            </RoundNav>
            <div className="flex-1">
              <LessonProgress value={((index + 1) / siblings.length) * 100} label={`${index + 1} / ${siblings.length}`} />
            </div>
            <RoundNav label="Página siguiente" disabled={!next} onClick={() => next && navigate(`/escaneo/${next}`)}>
              <ChevronRight className="size-5" />
            </RoundNav>
          </div>
        )}
      </div>

      {/* Cabecera */}
      <div className="flex items-start gap-4">
        <div className={clsx('flex size-14 shrink-0 items-center justify-center rounded-2xl', group ? `${GROUP_STYLES[group.color].soft} ${GROUP_STYLES[group.color].text}` : 'bg-beetle-light text-beetle-dark')}>
          {group ? <BookOpen className="size-7" /> : <FileText className="size-7" />}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black leading-tight sm:text-3xl">{scan.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-extrabold">
            <Chip>{ENGINE_LABEL[scan.engine]}</Chip>
            <Chip>{language}</Chip>
            <Chip>{formatNumber(scan.wordCount)} palabras</Chip>
            <Chip>{formatDate(scan.createdAt)}</Chip>
          </div>
        </div>
      </div>

      {/* Acciones en fila (móvil y tablet) */}
      <div className="grid grid-cols-5 gap-2 lg:hidden">{actions(true)}</div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="space-y-4">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'texto', label: 'Texto', icon: <FileText className="size-5" /> },
              { value: 'analisis', label: 'Análisis', icon: <BrainCircuit className="size-5" /> },
            ]}
          />

          {tab === 'texto' &&
            (editing ? (
              <Card className="space-y-3 p-4 sm:p-6">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg font-black" aria-label="Título" maxLength={200} />
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={18} aria-label="Texto escaneado" className="font-serif text-base" autoFocus />
                <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                  <Button variant="plain" icon={<X className="size-5" />} onClick={cancelEdit}>
                    Cancelar
                  </Button>
                  <Button icon={<Save className="size-5" />} disabled={!dirty} loading={saving} onClick={save}>
                    Guardar
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="relative px-5 py-6 sm:px-10 sm:py-10">
                <article className="mx-auto max-w-2xl whitespace-pre-line font-serif text-lg leading-relaxed sm:text-xl" aria-label="Texto escaneado">
                  {scan.text || <span className="font-sans text-hare">Este escaneo no tiene texto.</span>}
                </article>
              </Card>
            ))}

          {tab === 'analisis' && <AnalysisPanel key={scan.id} targetType="scan" targetId={scan.id} text={scan.text} />}
        </div>

        {/* Columna lateral en escritorio */}
        <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block">
          <div className="grid grid-cols-2 gap-2">{actions(false)}</div>
          <Card className="space-y-3 p-4 text-sm">
            <Detail label="Grupo" value={scan.groupTitle ?? 'Individual'} />
            <Detail label="Motor" value={ENGINE_LABEL[scan.engine]} />
            <Detail label="Idioma" value={language} />
            <Detail label="Palabras" value={formatNumber(scan.wordCount)} />
            <Detail label="Creado" value={formatDate(scan.createdAt)} />
          </Card>
        </aside>
      </div>

      <Modal open={moving} onClose={() => setMoving(false)} title="Mover a…">
        <div className="space-y-2">
          <MoveOption selected={scan.groupId === null} onClick={() => moveTo(null)} icon={<FileText className="size-5" />} iconClass="bg-beetle-light text-beetle-dark">
            Ninguno (individual)
          </MoveOption>
          {groups.map((g) => (
            <MoveOption
              key={g.id}
              selected={scan.groupId === g.id}
              onClick={() => moveTo(g.id)}
              icon={<BookOpen className="size-5" />}
              iconClass={`${GROUP_STYLES[g.color].soft} ${GROUP_STYLES[g.color].text}`}
            >
              {g.title}
            </MoveOption>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-lg bg-polar px-2 py-1 text-wolf">{children}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-bold text-hare">{label}</span>
      <span className="truncate font-extrabold">{value}</span>
    </div>
  );
}

function RoundNav({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-b-4 border-swan bg-white text-wolf transition hover:bg-polar active:translate-y-[2px] active:border-b-2 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function MoveOption({
  selected,
  onClick,
  icon,
  iconClass,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  iconClass: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'flex w-full items-center gap-3 rounded-2xl border-2 border-b-4 p-3 text-left font-extrabold transition active:translate-y-[2px] active:border-b-2',
        selected ? 'border-macaw bg-macaw-light text-macaw-dark' : 'border-swan hover:bg-polar',
      )}
    >
      <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-xl', iconClass)}>{icon}</span>
      <span className="truncate">{children}</span>
    </button>
  );
}
