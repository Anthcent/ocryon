import clsx from 'clsx';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Copy, Download, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { errorMessage, useFeedback } from '../components/feedback';
import { Button, Card, EmptyState, IconButton, PageLoader, Segmented } from '../components/ui';
import { api } from '../lib/api';
import { GROUP_STYLES } from '../lib/constants';
import { downloadText, formatDate, formatNumber } from '../lib/format';
import type { Group, Scan } from '../lib/types';
import { GroupFormModal } from './Catalog';

type Tab = 'paginas' | 'texto' | 'analisis';

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
    await api.scans.remove(scan.id);
    setScans((s) => s.filter((x) => x.id !== scan.id));
    toast('Página borrada');
  };

  const removeGroup = async () => {
    const ok = await confirm({
      title: '¿Borrar el grupo?',
      message: `Se borrarán «${group.title}» y sus ${scans.length} páginas. Esta acción no se puede deshacer.`,
      confirmLabel: 'Borrar todo',
      danger: true,
    });
    if (!ok) return;
    await api.groups.remove(group.id);
    toast('Grupo borrado');
    navigate('/catalogo', { replace: true });
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(fullText);
    toast('Texto copiado');
  };

  return (
    <div className="space-y-6">
      <Link to="/catalogo" className="inline-flex items-center gap-1 text-sm font-extrabold uppercase text-hare hover:text-wolf">
        <ArrowLeft className="size-4" /> Catálogo
      </Link>

      <div className={clsx('rounded-3xl border-b-4 p-5 text-white sm:p-6', style.bg, style.border)}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black sm:text-3xl">{group.title}</h1>
            {group.description && <p className="mt-1 text-white/90">{group.description}</p>}
            <p className="mt-3 text-sm font-bold text-white/90">
              {scans.length} {scans.length === 1 ? 'página' : 'páginas'} · {formatNumber(words)} palabras · creado el {formatDate(group.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0">
            <IconButton label="Editar grupo" onClick={() => setEditing(true)} className="text-white hover:bg-white/20 hover:text-white">
              <Pencil className="size-5" />
            </IconButton>
            <IconButton label="Borrar grupo" onClick={removeGroup} className="text-white hover:bg-white/20 hover:text-white">
              <Trash2 className="size-5" />
            </IconButton>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to={`/escanear?grupo=${group.id}`}>
            <Button variant="plain" size="sm" icon={<Plus className="size-4" />} className="text-eel">
              Añadir páginas
            </Button>
          </Link>
          <Button variant="plain" size="sm" icon={<Download className="size-4" />} disabled={!scans.length} onClick={() => downloadText(`${group.title}.txt`, fullText)}>
            Exportar .txt
          </Button>
          <Button variant="plain" size="sm" icon={<Copy className="size-4" />} disabled={!scans.length} onClick={copyAll}>
            Copiar
          </Button>
        </div>
      </div>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'paginas', label: 'Páginas' },
          { value: 'texto', label: 'Texto' },
          { value: 'analisis', label: 'Análisis' },
        ]}
      />

      {tab === 'paginas' &&
        (scans.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FileText className="size-10" />}
              title="Este grupo está vacío"
              action={
                <Link to={`/escanear?grupo=${group.id}`}>
                  <Button icon={<Plus className="size-5" />}>Añadir páginas</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {scans.map((s, i) => (
              <Card key={s.id} className="flex items-center gap-3 p-3 sm:p-4">
                <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-xl font-black', style.soft, style.text)}>{i + 1}</span>
                <Link to={`/escaneo/${s.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-extrabold hover:text-macaw">{s.title}</div>
                  <p className="line-clamp-1 text-sm text-wolf">{s.text || 'Sin texto'}</p>
                </Link>
                <div className="flex shrink-0">
                  <IconButton label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-4" />
                  </IconButton>
                  <IconButton label="Bajar" disabled={i === scans.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-4" />
                  </IconButton>
                  <IconButton label="Borrar página" onClick={() => removeScan(s)} className="hover:text-cardinal">
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </Card>
            ))}
          </div>
        ))}

      {tab === 'texto' && (
        <Card className="p-5 sm:p-8">
          {scans.length === 0 ? (
            <p className="text-wolf">Sin texto todavía.</p>
          ) : (
            <article className="mx-auto max-w-2xl space-y-8 text-lg leading-relaxed">
              {scans.map((s, i) => (
                <section key={s.id}>
                  <div className="mb-2 text-xs font-black uppercase tracking-wide text-hare">Página {i + 1}</div>
                  <p className="whitespace-pre-line">{s.text}</p>
                </section>
              ))}
            </article>
          )}
        </Card>
      )}

      {tab === 'analisis' && <AnalysisPanel targetType="group" targetId={group.id} text={fullText} />}

      <GroupFormModal open={editing} onClose={() => setEditing(false)} group={group} onSaved={setGroup} />
    </div>
  );
}
