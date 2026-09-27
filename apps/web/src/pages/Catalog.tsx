import clsx from 'clsx';
import { BookOpen, BookOpenText, FileText, Plus, ScanLine } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { errorMessage, useFeedback } from '../components/feedback';
import { LessonProgress } from '../components/ActionTile';
import { EMPTY_GROUP, GroupFields } from '../components/GroupFields';
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, PageLoader, Segmented } from '../components/ui';
import { api } from '../lib/api';
import { categoryEmoji, ENGINE_LABEL, GROUP_STYLES } from '../lib/constants';
import { formatNumber, timeAgo } from '../lib/format';
import type { Group, GroupInput, Scan } from '../lib/types';

type View = 'grupos' | 'individuales';
const PAGE_SIZE = 30;

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('vista') === 'individuales' ? 'individuales' : 'grupos';
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader
        title="Catálogo"
        subtitle="Tus libros y documentos escaneados."
        actions={
          <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Nuevo grupo
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-[320px_1fr]">
        <Segmented<View>
          value={view}
          onChange={(v) => setParams(v === 'grupos' ? {} : { vista: v }, { replace: true })}
          options={[
            { value: 'grupos', label: 'Grupos', icon: <BookOpen className="size-4" /> },
            { value: 'individuales', label: 'Individuales', icon: <FileText className="size-4" /> },
          ]}
        />
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar por título…" aria-label="Filtrar" />
      </div>
      {view === 'grupos' ? <GroupsList filter={filter} /> : <IndividualList filter={filter} />}
      <GroupFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

const matches = (title: string, filter: string) =>
  title.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').includes(
    filter.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').trim(),
  );

function GroupsList({ filter }: { filter: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  useEffect(() => {
    api.groups.list().then((r) => setGroups(r.groups)).catch(() => setGroups([]));
  }, []);

  if (!groups) return <PageLoader />;
  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<BookOpen className="size-10" />}
          title="Aún no tienes grupos"
          action={
            <Link to="/escanear">
              <Button icon={<ScanLine className="size-5" />}>Escanear un libro</Button>
            </Link>
          }
        >
          Un grupo reúne varias páginas en orden, por ejemplo un libro o un capítulo.
        </EmptyState>
      </Card>
    );
  }

  const categories = [...new Set(groups.map((g) => g.category).filter(Boolean))];
  const visible = groups.filter((g) => (matches(g.title, filter) || matches(g.author, filter)) && (!category || g.category === category));

  return (
    <div className="space-y-4">
      {categories.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por categoría">
          <CategoryChip selected={category === null} onClick={() => setCategory(null)} label="Todas" emoji="✨" />
          {categories.map((c) => (
            <CategoryChip key={c} selected={category === c} onClick={() => setCategory(category === c ? null : c)} label={c} emoji={categoryEmoji(c)} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((g) => (
          <BookCard key={g.id} group={g} />
        ))}
      </div>
      {visible.length === 0 && <p className="text-wolf">Ningún grupo coincide con el filtro.</p>}
    </div>
  );
}

function CategoryChip({ selected, onClick, label, emoji }: { selected: boolean; onClick: () => void; label: string; emoji: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-2xl border-2 border-b-4 px-3 py-1.5 text-sm font-extrabold transition active:translate-y-[2px] active:border-b-2',
        selected ? 'border-macaw bg-macaw-light text-macaw-dark' : 'border-swan bg-white text-wolf hover:bg-polar',
      )}
    >
      <span aria-hidden>{emoji}</span>
      {label}
    </button>
  );
}

/** Tarjeta de un grupo con aspecto de libro: lomo, portada de color y avance de páginas. */
function BookCard({ group: g }: { group: Group }) {
  const style = GROUP_STYLES[g.color];
  const pages = g.scanCount ?? 0;
  return (
    <Card interactive className="group relative overflow-hidden">
      <Link to={`/catalogo/grupo/${g.id}`} className="block">
        <div className={clsx('relative flex h-36 flex-col justify-end overflow-hidden p-4 pl-7 text-white', style.bg)}>
          {/* Lomo del libro */}
          <span className="absolute inset-y-0 left-0 w-3 bg-black/15" />
          <span className="absolute inset-y-0 left-3 w-px bg-white/30" />
          <BookOpen className="absolute -right-3 -top-3 size-24 text-white/15" />
          {g.category && (
            <span className="absolute left-7 top-3 rounded-lg bg-white/25 px-2 py-0.5 text-xs font-extrabold">
              {categoryEmoji(g.category)} {g.category}
            </span>
          )}
          <div className="line-clamp-2 text-xl font-black leading-tight">{g.title}</div>
          {g.author && <div className="truncate text-sm font-bold text-white/85">{g.author}</div>}
        </div>
        <div className="space-y-2 p-4">
          {g.totalPages ? (
            <LessonProgress value={(pages / g.totalPages) * 100} label={`${pages}/${g.totalPages}`} />
          ) : (
            <div className="text-sm font-extrabold text-wolf">
              {pages} {pages === 1 ? 'hoja escaneada' : 'hojas escaneadas'}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs font-bold text-hare">
            <span>{formatNumber(g.wordCount ?? 0)} palabras</span>·<span>{timeAgo(g.updatedAt)}</span>
          </div>
        </div>
      </Link>
      {pages > 0 && (
        <Link
          to={`/catalogo/grupo/${g.id}?libro=1`}
          aria-label={`Leer «${g.title}» en modo libro`}
          className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-xl border-2 border-b-4 border-white/70 bg-white px-2.5 py-1.5 text-xs font-extrabold uppercase text-eel shadow-sm transition hover:bg-polar active:translate-y-[2px] active:border-b-2"
        >
          <BookOpenText className="size-4" /> Modo libro
        </Link>
      )}
    </Card>
  );
}

function IndividualList({ filter }: { filter: string }) {
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    api.scans
      .list({ scope: 'individual', limit: PAGE_SIZE })
      .then((r) => {
        setScans(r.scans);
        setTotal(r.total);
      })
      .catch(() => setScans([]));
  }, []);

  const loadMore = async () => {
    if (!scans) return;
    setLoadingMore(true);
    const r = await api.scans.list({ scope: 'individual', limit: PAGE_SIZE, offset: scans.length }).catch(() => null);
    if (r) setScans([...scans, ...r.scans]);
    setLoadingMore(false);
  };

  if (!scans) return <PageLoader />;
  if (scans.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<FileText className="size-10" />}
          title="Sin escaneos individuales"
          action={
            <Link to="/escanear">
              <Button icon={<ScanLine className="size-5" />}>Escanear</Button>
            </Link>
          }
        >
          Los escaneos individuales son páginas sueltas: una receta, un apunte, un documento.
        </EmptyState>
      </Card>
    );
  }

  const visible = scans.filter((s) => matches(s.title, filter));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((s) => (
          <Link key={s.id} to={`/escaneo/${s.id}`} className="block">
            <Card interactive className="flex h-full flex-col p-4">
              <div className="mb-2 flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-beetle-light text-beetle-dark">
                  <FileText className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-extrabold">{s.title}</div>
                  <div className="text-xs font-bold text-hare">{timeAgo(s.createdAt)}</div>
                </div>
              </div>
              {/* Vista previa del texto, como una nota */}
              <p className="line-clamp-3 flex-1 font-serif text-sm leading-relaxed text-wolf">{s.text}</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge>{ENGINE_LABEL[s.engine]}</Badge>
                <span className="text-xs font-bold text-hare">{s.wordCount} palabras</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      {scans.length < total && (
        <Button variant="plain" block loading={loadingMore} onClick={loadMore}>
          Cargar más
        </Button>
      )}
    </div>
  );
}

/** Crear o editar un grupo. */
export function GroupFormModal({ open, onClose, group, onSaved }: { open: boolean; onClose: () => void; group?: Group; onSaved?: (g: Group) => void }) {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [data, setData] = useState<GroupInput>(EMPTY_GROUP);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(
      group
        ? { title: group.title, description: group.description, author: group.author, category: group.category, color: group.color, totalPages: group.totalPages }
        : EMPTY_GROUP,
    );
  }, [open, group]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.title.trim()) return toast('Ponle un nombre al grupo', 'error');
    setSaving(true);
    try {
      const result = group ? await api.groups.update(group.id, data) : await api.groups.create(data);
      onClose();
      if (onSaved) onSaved(result.group);
      else navigate(`/catalogo/grupo/${result.group.id}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={group ? 'Editar grupo' : 'Nuevo grupo'} wide>
      <form onSubmit={submit} className="space-y-5">
        <GroupFields value={data} onChange={setData} withDescription autoFocus />
        <Button type="submit" block loading={saving}>
          {group ? 'Guardar cambios' : 'Crear grupo'}
        </Button>
      </form>
    </Modal>
  );
}
