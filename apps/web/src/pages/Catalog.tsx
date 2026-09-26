import clsx from 'clsx';
import { BookOpen, FileText, Plus, ScanLine } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { errorMessage, useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Segmented, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { ENGINE_LABEL, GROUP_COLORS, GROUP_STYLES } from '../lib/constants';
import { formatNumber, timeAgo } from '../lib/format';
import type { Group, GroupColor, Scan } from '../lib/types';

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
  useEffect(() => {
    api.groups.list().then((r) => setGroups(r.groups)).catch(() => setGroups([]));
  }, []);

  if (!groups) return <PageLoader />;
  const visible = groups.filter((g) => matches(g.title, filter));
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

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((g) => {
        const style = GROUP_STYLES[g.color];
        return (
          <Link key={g.id} to={`/catalogo/grupo/${g.id}`}>
            <Card interactive className="overflow-hidden">
              <div className={clsx('flex h-24 items-end p-4', style.bg)}>
                <BookOpen className="size-10 text-white/90" />
              </div>
              <div className="p-4">
                <div className="truncate text-lg font-black">{g.title}</div>
                {g.description && <p className="line-clamp-1 text-sm text-wolf">{g.description}</p>}
                <div className="mt-2 flex items-center gap-2 text-sm font-bold text-wolf">
                  <span>{g.scanCount} pág.</span>·<span>{formatNumber(g.wordCount ?? 0)} palabras</span>·<span>{timeAgo(g.updatedAt)}</span>
                </div>
              </div>
            </Card>
          </Link>
        );
      })}
      {visible.length === 0 && <p className="text-wolf">Ningún grupo coincide con «{filter}».</p>}
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
  const [title, setTitle] = useState(group?.title ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [color, setColor] = useState<GroupColor>(group?.color ?? 'green');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(group?.title ?? '');
    setDescription(group?.description ?? '');
    setColor(group?.color ?? 'green');
  }, [open, group]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = { title, description, color };
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
    <Modal open={open} onClose={onClose} title={group ? 'Editar grupo' : 'Nuevo grupo'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} placeholder="Ej. Don Quijote — Tomo I" autoFocus />
        </Field>
        <Field label="Descripción (opcional)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} />
        </Field>
        <Field label="Color">
          <div className="flex gap-2">
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                className={clsx('size-9 rounded-full', GROUP_STYLES[c].bg, color === c && 'ring-4 ring-macaw/40 ring-offset-2')}
              />
            ))}
          </div>
        </Field>
        <Button type="submit" block loading={saving}>
          {group ? 'Guardar cambios' : 'Crear grupo'}
        </Button>
      </form>
    </Modal>
  );
}
