import clsx from 'clsx';
import { ArrowLeft, BookOpen, BookOpenText, BrainCircuit, ChevronLeft, ChevronRight, Clock, Copy, Download, FileText, LayoutGrid, Pencil, Plus, Trash2, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ActionTile } from '../components/ActionTile';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { errorMessage, useFeedback } from '../components/feedback';
import { Reader } from '../components/Reader';
import { Button, EmptyState, PageLoader, Segmented } from '../components/ui';
import { api } from '../lib/api';
import { GROUP_STYLES } from '../lib/constants';
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

  return (
    <div className="space-y-5">
      <Link to="/catalogo" className="inline-flex items-center gap-1 text-sm font-extrabold uppercase text-hare hover:text-wolf">
        <ArrowLeft className="size-4" /> Catálogo
      </Link>

      {/* Portada del grupo */}
      <div className={clsx('overflow-hidden rounded-3xl border-b-[6px]', style.bg, style.border)}>
        <div className="flex gap-4 p-5 text-white sm:gap-6 sm:p-6">
          <div className="hidden size-24 shrink-0 items-center justify-center rounded-2xl bg-white/20 sm:flex">
            <BookOpen className="size-12" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black leading-tight sm:text-3xl">{group.title}</h1>
            {group.description && <p className="mt-1 line-clamp-2 text-white/90">{group.description}</p>}
            <div className="mt-3 flex flex-wrap gap-2 text-sm font-extrabold">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-2.5 py-1">
                <FileText className="size-4" /> {scans.length} {scans.length === 1 ? 'página' : 'páginas'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-2.5 py-1">
                <Type className="size-4" /> {formatNumber(words)} palabras
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-2.5 py-1">
                <Clock className="size-4" /> {minutes} min de lectura
              </span>
            </div>
            <p className="mt-2 text-xs font-bold text-white/80">Creado el {formatDate(group.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Acciones principales, siempre a la vista */}
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        <ActionTile icon={<Plus />} label="Añadir páginas" shortLabel="Añadir" tone="green" onClick={addPages} compact />
        <ActionTile icon={<Download />} label="Exportar .txt" shortLabel=".txt" tone="blue" disabled={!scans.length} onClick={() => downloadText(`${group.title}.txt`, fullText)} compact />
        <ActionTile icon={<Copy />} label="Copiar" tone="purple" disabled={!scans.length} onClick={copyAll} compact />
        <ActionTile icon={<Pencil />} label="Editar grupo" shortLabel="Editar" tone="orange" onClick={() => setEditing(true)} compact />
        <ActionTile icon={<Trash2 />} label="Borrar grupo" shortLabel="Borrar" tone="red" onClick={removeGroup} compact />
      </div>

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
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
            {scans.map((s, i) => (
              <div key={s.id} className="flex flex-col overflow-hidden rounded-2xl border-2 border-b-4 border-swan bg-white">
                <Link to={`/escaneo/${s.id}`} className="group flex flex-1 flex-col p-3 hover:bg-polar">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl text-base font-black', style.soft, style.text)}>{i + 1}</span>
                    <span className="text-xs font-bold text-hare">{formatNumber(s.wordCount)} pal.</span>
                  </div>
                  <div className="truncate text-sm font-extrabold group-hover:text-macaw">{s.title}</div>
                  {/* Vista previa como una mini página */}
                  <p className="mt-1 line-clamp-5 font-serif text-xs leading-relaxed text-wolf">{s.text || 'Sin texto'}</p>
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
              className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-hare text-wolf transition hover:border-feather hover:bg-feather-light hover:text-feather-dark"
            >
              <Plus className="size-9" />
              <span className="text-sm font-extrabold uppercase">Añadir páginas</span>
            </button>
          </div>
        ))}

      {tab === 'leer' && <Reader pages={scans} />}

      {tab === 'analisis' && <AnalysisPanel targetType="group" targetId={group.id} text={fullText} />}

      <GroupFormModal open={editing} onClose={() => setEditing(false)} group={group} onSaved={setGroup} />
    </div>
  );
}
