import clsx from 'clsx';
import { BookOpen, BookOpenText, FileText, Library, Plus, ScanLine } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { errorMessage, useFeedback } from '../components/feedback';
import { LessonProgress } from '../components/ActionTile';
import { BookCover } from '../components/BookCover';
import { EMPTY_GROUP, GroupFields } from '../components/GroupFields';
import { Badge, Button, Card, EmptyState, Input, Modal, PageLoader, Segmented } from '../components/ui';
import { api } from '../lib/api';
import { categoryEmoji, ENGINE_LABEL, GROUP_STYLES } from '../lib/constants';
import { formatNumber, timeAgo } from '../lib/format';
import type { Group, GroupInput, Scan, Stats } from '../lib/types';

type View = 'grupos' | 'individuales';
const PAGE_SIZE = 30;

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('vista') === 'individuales' ? 'individuales' : 'grupos';
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <LibraryHero onCreate={() => setCreating(true)} />
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
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

/** Tarjeta de un libro: portada 3D, datos, avance y accesos directos. */
function BookCard({ group: g }: { group: Group }) {
  const style = GROUP_STYLES[g.color];
  const pages = g.scanCount ?? 0;
  return (
    <div className={clsx('group relative flex gap-4 overflow-hidden rounded-3xl border-2 border-b-[5px] p-4 transition hover:-translate-y-0.5 hover:shadow-lg', style.soft, style.border)}>
      <span className={clsx('pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-15', style.bg)} />
      <Link to={`/catalogo/grupo/${g.id}`} aria-hidden tabIndex={-1}>
        <BookCover group={g} size="md" />
      </Link>
      <div className="relative flex min-w-0 flex-1 flex-col">
        {g.category && (
          <span className={clsx('mb-1 self-start rounded-lg px-2 py-0.5 text-[11px] font-extrabold text-white', style.bg)}>
            {categoryEmoji(g.category)} {g.category}
          </span>
        )}
        <Link to={`/catalogo/grupo/${g.id}`} className="line-clamp-2 text-lg font-black leading-tight text-eel hover:underline">
          {g.title}
        </Link>
        {g.author && <div className={clsx('truncate text-sm font-extrabold', style.text)}>{g.author}</div>}
        <div className="mt-2 space-y-1.5">
          {g.totalPages ? (
            <LessonProgress value={(pages / g.totalPages) * 100} label={`${pages}/${g.totalPages}`} />
          ) : (
            <div className="text-sm font-extrabold text-wolf">
              📄 {pages} {pages === 1 ? 'hoja escaneada' : 'hojas escaneadas'}
            </div>
          )}
          <div className="text-xs font-bold text-hare">
            {formatNumber(g.wordCount ?? 0)} palabras · {timeAgo(g.updatedAt)}
          </div>
        </div>
        <div className="mt-auto flex gap-2 pt-3">
          <Link
            to={`/catalogo/grupo/${g.id}`}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-b-4 border-swan bg-white px-3 py-2 text-xs font-extrabold uppercase text-wolf transition hover:bg-polar active:translate-y-[2px] active:border-b-2"
          >
            Abrir
          </Link>
          {pages > 0 && (
            <Link
              to={`/catalogo/grupo/${g.id}?libro=1`}
              aria-label={`Leer «${g.title}» en modo libro`}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-b-4 border-feather-dark bg-feather px-3 py-2 text-xs font-extrabold uppercase text-white transition hover:brightness-105 active:translate-y-[2px] active:border-b-2"
            >
              <BookOpenText className="size-4" /> Leer
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** Cabecera del catálogo con el resumen de la biblioteca. */
function LibraryHero({ onCreate }: { onCreate: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
  }, []);
  const tiles = [
    { label: 'libros', value: stats?.totals.groups ?? 0, emoji: '📚' },
    { label: 'sueltos', value: stats?.totals.individual ?? 0, emoji: '📝' },
    { label: 'palabras', value: formatNumber(stats?.totals.words ?? 0), emoji: '✍️' },
  ];
  return (
    <div className="relative mb-6 overflow-hidden rounded-[2rem] border-b-[6px] border-fox-dark bg-gradient-to-br from-fox via-[#ffab2e] to-bee p-5 text-white sm:p-7">
      <Library className="pointer-events-none absolute -bottom-8 -right-6 size-48 text-white/15" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Tu biblioteca</h1>
          <p className="font-bold text-white/90">Tus libros y documentos escaneados, listos para leer.</p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-2xl border-2 border-b-4 border-white/70 bg-white px-4 py-2.5 text-sm font-extrabold uppercase text-fox-dark transition hover:bg-fox-light active:translate-y-[2px] active:border-b-2"
        >
          <Plus className="size-5" /> Nuevo grupo
        </button>
      </div>
      <div className="relative mt-5 grid max-w-lg grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-white/20 px-3 py-2.5 backdrop-blur">
            <div className="text-2xl font-black leading-none">
              <span className="mr-1 text-lg">{t.emoji}</span>
              {t.value}
            </div>
            <div className="mt-1 text-xs font-extrabold uppercase text-white/85">{t.label}</div>
          </div>
        ))}
      </div>
    </div>
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
