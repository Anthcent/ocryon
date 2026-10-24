import { ArrowLeft, BookOpen, FileText, Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Button, Field, Input, PageLoader } from '../components/ui';
import { api } from '../lib/api';
import type { AdminCatalog, User } from '../lib/types';

type Profile = Pick<User, 'name' | 'email' | 'room'>;
const date = (value: string) => new Date(value).toLocaleDateString('es-VE');
const matches = (value: string, filter: string) => value.toLocaleLowerCase('es').includes(filter);

function Entry({ userId, id, title, subtitle, kind }: {
  userId: number; id: number; title: string; subtitle: string; kind: 'scan' | 'document';
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const open = async (isOpen: boolean) => {
    if (!isOpen || text !== null || loading) return;
    setLoading(true);
    setError('');
    try {
      const result = kind === 'scan'
        ? (await api.administration.userScan(userId, id)).scan
        : (await api.administration.userDocument(userId, id)).document;
      setText(result.text);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir el texto'); }
    finally { setLoading(false); }
  };
  return <details className="border-t border-swan px-3 py-2 open:bg-polar/60" onToggle={(e) => void open(e.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold text-eel hover:text-feather-dark focus-visible:outline-2 focus-visible:outline-offset-2">
      {title}<span className="ml-2 text-sm font-normal text-wolf">{subtitle}</span>
    </summary>
    {loading && <p role="status" className="py-3 text-wolf">Cargando texto…</p>}
    {error && <p role="alert" className="py-3 text-cardinal-dark">{error}</p>}
    {text !== null && <p className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words py-3 text-sm leading-relaxed text-eel">{text || 'Sin texto reconocido.'}</p>}
  </details>;
}

export function AdministrationUserPage() {
  const { id } = useParams();
  const { user: actor } = useAuth();
  const userId = Number(id);
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null);
  const [draft, setDraft] = useState<Profile>({ name: '', email: '', room: '' });
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!Number.isSafeInteger(userId) || userId <= 0 || actor?.role === 'personal') return;
    let active = true;
    api.administration.catalog(userId).then((data) => {
      if (!active) return;
      setCatalog(data);
      setDraft({ name: data.user.name, email: data.user.email, room: data.user.room });
    }).catch((e) => { if (active) setError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo'); });
    return () => { active = false; };
  }, [userId, actor?.role]);

  if (!actor || actor.role === 'personal') return <p role="alert">No tienes permiso para ver esta página.</p>;
  if (!Number.isSafeInteger(userId) || userId <= 0) return <p role="alert">Usuario no válido.</p>;
  if (!catalog && !error) return <PageLoader />;
  if (!catalog) return <p role="alert" className="text-cardinal-dark">{error}</p>;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { user } = await api.administration.updateProfile(userId, draft);
      setCatalog((old) => old && { ...old, user });
      setDraft({ name: user.name, email: user.email, room: user.room });
      setMessage('Datos del usuario guardados.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron guardar los datos'); }
    finally { setSaving(false); }
  };
  const query = filter.trim().toLocaleLowerCase('es');
  const scans = catalog.scans;
  const ungrouped = scans.filter((scan) => scan.groupId === null && matches(scan.title || `Página ${scan.id}`, query));
  const documents = catalog.documents.filter((doc) => matches(doc.title, query));
  const groups = catalog.groups.map((group) => ({
    ...group,
    pages: scans.filter((scan) => scan.groupId === group.id &&
      (matches(group.title, query) || matches(group.author, query) || matches(scan.title || `Página ${scan.id}`, query) || matches(scan.pageLabel, query))),
  })).filter((group) => !query || matches(group.title, query) || matches(group.author, query) || group.pages.length > 0);

  return <div className="mx-auto max-w-5xl space-y-6">
    <Link to="/administracion" className="inline-flex items-center gap-2 font-semibold text-feather-dark underline underline-offset-4 focus-visible:outline-2"><ArrowLeft className="size-4" /> Volver a administración</Link>
    <header>
      <h1 className="break-words text-2xl font-black text-eel sm:text-3xl">{catalog.user.name}</h1>
      <p className="break-all text-wolf">{catalog.user.email} · {catalog.user.room || 'Sin sala'} · {catalog.user.role}</p>
      <p className="mt-1 text-sm text-wolf">{catalog.groups.length} grupos · {scans.length} páginas · {catalog.documents.length} documentos</p>
    </header>

    {actor.role === 'admin' && catalog.user.role !== 'admin' && <section aria-labelledby="profile-heading" className="rounded-2xl border-2 border-swan bg-white p-4 sm:p-5">
      <h2 id="profile-heading" className="mb-3 text-xl font-bold text-eel">Datos del usuario</h2>
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre"><Input required minLength={2} maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label="Sala"><Input required minLength={2} maxLength={100} value={draft.room} onChange={(e) => setDraft({ ...draft, room: e.target.value })} /></Field>
        </div>
        <Field label="Correo electrónico"><Input required type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
        <Button type="submit" loading={saving}>Guardar datos</Button>
      </form>
      {message && <p role="status" className="mt-3 text-sm font-semibold text-feather-dark">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-cardinal-dark">{error}</p>}
    </section>}

    <section aria-labelledby="catalog-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="catalog-heading" className="text-xl font-bold text-eel">Catálogo de {catalog.user.name}</h2><p className="text-sm text-wolf">Abre una página para leer su texto.</p></div>
        <label className="relative w-full sm:w-72"><span className="sr-only">Buscar en el catálogo</span><Search aria-hidden className="absolute left-3 top-3.5 size-5 text-wolf" /><Input className="pl-10" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar título o página" /></label>
      </div>
      {groups.map((group) => <details key={group.id} className="rounded-xl border border-swan bg-white" open={query ? true : undefined}>
        <summary className="cursor-pointer px-4 py-3 font-bold text-eel focus-visible:outline-2 focus-visible:outline-offset-2"><BookOpen aria-hidden className="mr-2 inline size-5 text-feather-dark" />{group.title} <span className="text-sm font-normal text-wolf">{group.author && `· ${group.author} `}· {group.scanCount} páginas</span></summary>
        {group.pages.length ? group.pages.map((scan) => <Entry key={scan.id} userId={userId} id={scan.id} kind="scan" title={scan.title || scan.pageLabel || `Página ${scan.position || scan.id}`} subtitle={`${scan.pageLabel ? `p. ${scan.pageLabel} · ` : ''}${date(scan.createdAt)}`} />)
          : <p className="border-t border-swan px-4 py-3 text-sm text-wolf">{query ? 'No hay páginas coincidentes.' : 'Este grupo aún no tiene páginas.'}</p>}
      </details>)}
      {ungrouped.length > 0 && <div className="rounded-xl border border-swan bg-white"><h3 className="px-4 py-3 font-bold text-eel">Páginas individuales ({ungrouped.length})</h3>{ungrouped.map((scan) => <Entry key={scan.id} userId={userId} id={scan.id} kind="scan" title={scan.title || `Página ${scan.id}`} subtitle={date(scan.createdAt)} />)}</div>}
      {documents.length > 0 && <div className="rounded-xl border border-swan bg-white"><h3 className="flex items-center gap-2 px-4 py-3 font-bold text-eel"><FileText aria-hidden className="size-5 text-feather-dark" />Documentos ({documents.length})</h3>{documents.map((doc) => <Entry key={doc.id} userId={userId} id={doc.id} kind="document" title={doc.title} subtitle={`${doc.templateName} · ${date(doc.createdAt)}`} />)}</div>}
      {!groups.length && !ungrouped.length && !documents.length && <p className="rounded-xl border border-swan bg-white p-5 text-wolf">{query ? 'No hay resultados para esa búsqueda.' : 'Este usuario aún no tiene escaneos ni documentos.'}</p>}
    </section>
  </div>;
}
