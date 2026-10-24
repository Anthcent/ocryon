import clsx from 'clsx';
import { BookOpenText, ChartNoAxesCombined, CircleCheck, FileText, KeyRound, Library, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, EmptyState, Field, Input } from '../components/ui';
import { api } from '../lib/api';
import type { User } from '../lib/types';
import { useSettings } from '../settings/SettingsContext';

type Tab = 'approvals' | 'users' | 'reports' | 'archive' | 'ocr';
const roleName = { admin: 'Admin', operator: 'Operador', personal: 'Personal' };
const statusName = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', suspended: 'Suspendido' };

export function AdministrationPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('modulo');
  const tab: Tab = requestedTab === 'users' || requestedTab === 'reports' || requestedTab === 'archive' ||
    (requestedTab === 'ocr' && user?.role === 'admin') ? requestedTab : 'approvals';
  const { settings, reload } = useSettings();
  const [users, setUsers] = useState<User[]>([]);
  const [reports, setReports] = useState<Awaited<ReturnType<typeof api.administration.reports>> | null>(null);
  const [archive, setArchive] = useState<Awaited<ReturnType<typeof api.administration.archive>>['scans']>([]);
  const [documents, setDocuments] = useState<Awaited<ReturnType<typeof api.administration.documents>>['documents']>([]);
  const [error, setError] = useState('');
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [keyEditorOpen, setKeyEditorOpen] = useState(false);
  const [keyValue, setKeyValue] = useState('');
  const [keySaving, setKeySaving] = useState(false);
  const [keyChecking, setKeyChecking] = useState(false);
  const [keyMessage, setKeyMessage] = useState('');

  useEffect(() => {
    if (user?.role === 'personal') return;
    Promise.all([api.administration.users(), api.administration.reports()])
      .then(([u, r]) => { setUsers(u.users); setReports(r); })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la administración'));
  }, [user?.role]);

  useEffect(() => {
    if (tab !== 'archive' || user?.role === 'personal') return;
    let active = true;
    setArchiveLoading(true);
    Promise.all([api.administration.archive(), api.administration.documents()])
      .then(([a, d]) => { if (active) { setArchive(a.scans); setDocuments(d.documents); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'No se pudo cargar el archivo'); })
      .finally(() => { if (active) setArchiveLoading(false); });
    return () => { active = false; };
  }, [tab, user?.role]);

  if (!user || user.role === 'personal') return <p role="alert">No tienes permiso para ver esta página.</p>;
  const pending = users.filter((person) => person.status === 'pending');
  const tabs: { id: Tab; name: string; icon: typeof Users }[] = [
    { id: 'approvals', name: `Solicitudes (${pending.length})`, icon: ShieldCheck },
    { id: 'users', name: 'Usuarios', icon: Users },
    { id: 'reports', name: 'Reportes', icon: ChartNoAxesCombined },
    { id: 'archive', name: 'Archivo', icon: Library },
    ...(user.role === 'admin' ? [{ id: 'ocr' as const, name: 'OCR Online', icon: KeyRound }] : []),
  ];

  const review = async (id: number, status: 'approved' | 'rejected' | 'suspended') => {
    setError('');
    try {
      const { user: updated } = await api.administration.review(id, status);
      setUsers((all) => all.map((person) => person.id === id ? { ...person, ...updated } : person));
      setReports(await api.administration.reports());
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar el usuario'); }
  };
  const setRole = async (id: number, role: 'personal' | 'operator') => {
    setError('');
    try {
      const { user: updated } = await api.administration.setRole(id, role);
      setUsers((all) => all.map((person) => person.id === id ? { ...person, ...updated } : person));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar el rol'); }
  };
  const remove = async (kind: 'scan' | 'document', id: number) => {
    if (!window.confirm('¿Borrar definitivamente este registro?')) return;
    setError('');
    try {
      if (kind === 'scan') { await api.administration.removeScan(id); setArchive((all) => all.filter((item) => item.id !== id)); }
      else { await api.administration.removeDocument(id); setDocuments((all) => all.filter((item) => item.id !== id)); }
      setReports(await api.administration.reports());
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo borrar el registro'); }
  };
  const saveKey = async (event: FormEvent) => {
    event.preventDefault();
    setKeySaving(true);
    setError('');
    setKeyMessage('');
    try {
      await api.administration.updateOcrKey(keyValue.trim());
      await reload();
      setKeyValue('');
      setKeyEditorOpen(false);
      setKeyMessage('Nueva clave guardada. Comprueba la conexión antes de escanear.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar la clave'); }
    finally { setKeySaving(false); }
  };
  const checkKey = async () => {
    setKeyChecking(true);
    setKeyMessage('');
    setError('');
    try {
      await api.settings.test('ocrspace');
      await reload();
      setKeyMessage('API conectada. OCR Online listo para todo el personal.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo verificar la conexión'); }
    finally { setKeyChecking(false); }
  };

  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-b-4 border-feather-dark bg-feather-light p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-feather text-white"><Library className="size-7" /></div>
        <div><h1 className="text-2xl font-black text-eel sm:text-3xl">Administración</h1><p className="text-sm font-medium text-wolf">Personal, archivo y servicios de la biblioteca</p></div>
      </div>
      {pending.length > 0 && <Badge tone="yellow">{pending.length} {pending.length === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}</Badge>}
    </header>
    {error && <p role="alert" className="rounded-xl bg-cardinal-light p-3 font-semibold text-cardinal-dark">{error}</p>}
    <nav aria-label="Módulos administrativos" className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map(({ id, name, icon: Icon }) => <button key={id} type="button" onClick={() => { setError(''); setParams(id === 'approvals' ? {} : { modulo: id }); }} aria-current={tab === id ? 'page' : undefined}
        className={clsx('inline-flex shrink-0 items-center gap-2 rounded-xl border-2 border-b-4 px-3 py-2.5 text-sm font-extrabold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
          tab === id ? 'border-feather-dark bg-feather-light text-eel' : 'border-swan bg-white text-wolf hover:bg-polar')}>
        <Icon aria-hidden className="size-4" />{name}
      </button>)}
    </nav>

    {(tab === 'approvals' || tab === 'users') && <section aria-label={tab === 'approvals' ? 'Solicitudes pendientes' : 'Usuarios'} className="space-y-3">
      <div><h2 className="text-xl font-black text-eel">{tab === 'approvals' ? 'Solicitudes pendientes' : 'Equipo de la biblioteca'}</h2><p className="text-sm text-wolf">{tab === 'approvals' ? 'Revisa sala y cuenta antes de aprobar.' : 'Abre una ficha para editar datos o consultar su catálogo.'}</p></div>
      <div className="divide-y divide-swan rounded-2xl border-2 border-swan bg-white">
        {(tab === 'approvals' ? pending : users).map((person) => <div key={person.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2"><strong className="break-words text-base text-eel">{person.name}</strong><Badge tone={person.status === 'approved' ? 'green' : person.status === 'pending' ? 'yellow' : 'red'}>{statusName[person.status]}</Badge></div>
            <p className="break-all text-sm text-wolf">{person.email} · {person.room || 'Sala por asignar'} · {roleName[person.role]}</p>
            <Link to={`/administracion/usuarios/${person.id}`} className="inline-block text-sm font-extrabold text-feather-dark underline underline-offset-4 focus-visible:outline-2">Ver ficha y catálogo de {person.name}</Link>
          </div>
          <div className="flex flex-wrap gap-2">
          {person.role === 'personal' && <>
            {person.status !== 'approved' && <Button size="sm" onClick={() => void review(person.id, 'approved')}>Aprobar</Button>}
            {person.status === 'pending' && <Button variant="plain" size="sm" onClick={() => void review(person.id, 'rejected')}>Rechazar</Button>}
            {person.status === 'approved' && <Button variant="plain" size="sm" onClick={() => void review(person.id, 'suspended')}>Suspender</Button>}
          </>}
          {user.role === 'admin' && person.status === 'approved' && person.role !== 'admin' &&
            <Button variant="plain" size="sm" onClick={() => void setRole(person.id, person.role === 'operator' ? 'personal' : 'operator')}>
              {person.role === 'operator' ? 'Cambiar a personal' : 'Designar operador'}
            </Button>}
          </div>
        </div>)}
        {tab === 'approvals' && pending.length === 0 && <EmptyState icon={<CircleCheck className="size-10" />} title="Sin solicitudes pendientes">Las nuevas solicitudes aparecerán aquí.</EmptyState>}
      </div>
    </section>}

    {tab === 'reports' && reports && <section className="space-y-5">
      <h2 className="text-xl font-black text-eel">Actividad de la biblioteca</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {([['staff', 'Personal'], ['books', 'Grupos'], ['pages', 'Páginas'], ['documents', 'Documentos'], ['words', 'Palabras'], ['pending', 'Pendientes']] as const).map(([key, label]) =>
          <div key={key} className="rounded-xl border-2 border-swan bg-white px-4 py-3"><strong className="block text-2xl font-black text-eel">{Number(reports.totals[key] ?? 0).toLocaleString('es-VE')}</strong><span className="text-sm font-semibold text-wolf">{label}</span></div>)}
      </div>
      <div className="rounded-2xl border-2 border-swan bg-white p-4"><h3 className="mb-3 font-extrabold text-eel">Actividad por sala</h3>
        {reports.byRoom.length ? <div className="divide-y divide-swan">{reports.byRoom.map((row, index) => <p key={`${row.room}-${index}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><strong>{row.room || 'Sin sala'}</strong><span>{row.books} grupos · {row.pages} páginas · {row.documents} documentos</span></p>)}</div> : <p className="text-sm text-wolf">Aún no hay actividad.</p>}
      </div>
      <div className="rounded-2xl border-2 border-swan bg-white p-4"><h3 className="mb-3 font-extrabold text-eel">Páginas por mes</h3>
        {reports.monthly.length ? <div className="divide-y divide-swan">{reports.monthly.map((row) => <p key={row.month} className="flex justify-between py-2 text-sm"><span>{row.month}</span><strong>{row.pages} páginas</strong></p>)}</div> : <p className="text-sm text-wolf">Aún no hay páginas.</p>}
      </div>
    </section>}

    {tab === 'archive' && <section className="space-y-4">
      <div><h2 className="text-xl font-black text-eel">Archivo institucional</h2><p className="text-sm text-wolf">Para ver todo el catálogo sin límite, abre la ficha de cada usuario.</p></div>
      {archiveLoading && <p role="status" className="text-wolf">Cargando archivo…</p>}
      <div className="rounded-2xl border-2 border-swan bg-white"><h3 className="flex items-center gap-2 px-4 py-3 font-extrabold text-eel"><BookOpenText className="size-5 text-feather-dark" /> Escaneos recientes</h3>
        <div className="divide-y divide-swan border-t border-swan">{archive.map((scan) => <details key={scan.id} className="px-4 py-3 open:bg-polar/50"><summary className="cursor-pointer font-semibold focus-visible:outline-2">{scan.groupTitle || scan.title || `Página ${scan.id}`} <span className="text-sm font-normal text-wolf">· {scan.userName} · {scan.room}</span></summary><p className="max-h-96 overflow-auto whitespace-pre-wrap break-words py-3 text-sm">{scan.text}</p>{user.role === 'admin' && <Button size="sm" variant="danger" onClick={() => void remove('scan', scan.id)}>Borrar escaneo</Button>}</details>)}</div>
        {!archiveLoading && !archive.length && <p className="border-t border-swan px-4 py-4 text-sm text-wolf">Aún no hay escaneos.</p>}
      </div>
      <div className="rounded-2xl border-2 border-swan bg-white"><h3 className="flex items-center gap-2 px-4 py-3 font-extrabold text-eel"><FileText className="size-5 text-feather-dark" /> Documentos recientes</h3>
        <div className="divide-y divide-swan border-t border-swan">{documents.map((doc) => <details key={doc.id} className="px-4 py-3 open:bg-polar/50"><summary className="cursor-pointer font-semibold focus-visible:outline-2">{doc.title} <span className="text-sm font-normal text-wolf">· {doc.userName} · {doc.room}</span></summary><p className="max-h-96 overflow-auto whitespace-pre-wrap break-words py-3 text-sm">{doc.text}</p>{user.role === 'admin' && <Button size="sm" variant="danger" onClick={() => void remove('document', doc.id)}>Borrar documento</Button>}</details>)}</div>
        {!archiveLoading && !documents.length && <p className="border-t border-swan px-4 py-4 text-sm text-wolf">Aún no hay documentos.</p>}
      </div>
    </section>}

    {tab === 'ocr' && user.role === 'admin' && <section className="space-y-4 rounded-2xl border-2 border-swan bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black text-eel">OCR Online</h2><p className="text-sm text-wolf">Una clave compartida para todo el personal. Nunca se muestra ni se guarda en el navegador.</p></div>
        <Badge tone={settings.keys.ocrspace.configured ? 'green' : 'yellow'}>{settings.keys.ocrspace.verified ? 'API conectada' : settings.keys.ocrspace.configured ? 'API configurada' : 'Sin configurar'}</Badge></div>
      <div className="flex flex-wrap gap-2">
        {settings.keys.ocrspace.configured && <Button variant="ghost" size="sm" loading={keyChecking} onClick={() => void checkKey()}>Probar conexión</Button>}
        {!keyEditorOpen && <Button size="sm" onClick={() => { setKeyEditorOpen(true); setKeyMessage(''); }}>{settings.keys.ocrspace.configured ? 'Cambiar clave' : 'Agregar clave'}</Button>}
      </div>
      {keyEditorOpen && <form onSubmit={(event) => void saveKey(event)} className="max-w-lg space-y-3 rounded-xl bg-polar p-4">
        <Field label="Nueva API key de OCR Online"><Input type="password" required minLength={8} maxLength={300} value={keyValue} onChange={(event) => setKeyValue(event.target.value)} autoComplete="off" /></Field>
        <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" loading={keySaving} disabled={keyValue.trim().length < 8}>Guardar nueva clave</Button><Button variant="plain" size="sm" onClick={() => { setKeyEditorOpen(false); setKeyValue(''); }}>Cancelar</Button></div>
      </form>}
      {keyMessage && <p role="status" className="font-semibold text-feather-dark">{keyMessage}</p>}
    </section>}
  </div>;
}
