import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import type { User } from '../lib/types';

export function AdministrationPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [reports, setReports] = useState<Awaited<ReturnType<typeof api.administration.reports>> | null>(null);
  const [archive, setArchive] = useState<Awaited<ReturnType<typeof api.administration.archive>>['scans']>([]);
  const [documents, setDocuments] = useState<Awaited<ReturnType<typeof api.administration.documents>>['documents']>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'approvals' | 'users' | 'reports' | 'archive'>('approvals');
  const [archiveLoading, setArchiveLoading] = useState(false);

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
  const review = async (id: number, status: 'approved' | 'rejected' | 'suspended') => {
    try {
      const { user: updated } = await api.administration.review(id, status);
      setUsers((all) => all.map((u) => u.id === id ? updated : u));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar el usuario'); }
  };
  const setRole = async (id: number, role: 'personal' | 'operator') => {
    try {
      const { user: updated } = await api.administration.setRole(id, role);
      setUsers((all) => all.map((u) => u.id === id ? updated : u));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar el rol'); }
  };
  const pending = users.filter((u) => u.status === 'pending');
  const remove = async (kind: 'scan' | 'document', id: number) => {
    if (!window.confirm('¿Borrar definitivamente este registro?')) return;
    try {
      if (kind === 'scan') { await api.administration.removeScan(id); setArchive((all) => all.filter((item) => item.id !== id)); }
      else { await api.administration.removeDocument(id); setDocuments((all) => all.filter((item) => item.id !== id)); }
      setReports((await api.administration.reports()));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo borrar el registro'); }
  };
  return <main className="mx-auto max-w-5xl space-y-6 p-5">
    <h1 className="text-3xl font-black">Administración de la biblioteca</h1>
    {error && <p role="alert" className="text-cardinal-dark">{error}</p>}
    <nav aria-label="Módulos administrativos" className="flex flex-wrap gap-2">
      {(['approvals', 'users', 'reports', 'archive'] as const).map((key) =>
        <button type="button" key={key} onClick={() => setTab(key)} aria-pressed={tab === key}
          className="rounded-xl border-2 border-feather-dark px-4 py-2 font-bold">
          {{ approvals: `Aprobaciones (${pending.length})`, users: 'Usuarios', reports: 'Reportes', archive: 'Archivo institucional' }[key]}
        </button>)}
    </nav>
    {(tab === 'approvals' || tab === 'users') && <section className="space-y-3">
      <h2 className="text-xl font-bold">{tab === 'approvals' ? 'Solicitudes pendientes' : 'Personal y responsables'}</h2>
      {(tab === 'approvals' ? pending : users).map((person) => <div key={person.id} className="rounded-xl border p-4">
        <p className="font-bold">{person.name} · {person.room || 'Sin sala'}</p>
        <p>{person.email} · {person.role} · {person.status}</p>
        <Link to={`/administracion/usuarios/${person.id}`} className="mt-2 inline-block font-bold text-feather-dark underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">Ver ficha y catálogo de {person.name}</Link>
        {person.role === 'personal' && <div className="mt-2 flex gap-2">
          {person.status !== 'approved' && <button onClick={() => review(person.id, 'approved')} className="rounded-lg bg-feather px-3 py-2 font-bold">Aprobar</button>}
          {person.status === 'pending' && <button onClick={() => review(person.id, 'rejected')} className="rounded-lg border px-3 py-2">Rechazar</button>}
          {person.status === 'approved' && <button onClick={() => review(person.id, 'suspended')} className="rounded-lg border px-3 py-2">Suspender</button>}
        </div>}
        {user.role === 'admin' && person.status === 'approved' && person.role !== 'admin' &&
          <button className="mt-2 rounded-lg border px-3 py-2" onClick={() => setRole(person.id, person.role === 'operator' ? 'personal' : 'operator')}>
            {person.role === 'operator' ? 'Cambiar a personal' : 'Designar operador'}
          </button>}
      </div>)}
      {tab === 'approvals' && !pending.length && <p>No hay solicitudes pendientes.</p>}
    </section>}
    {tab === 'reports' && reports && <section className="space-y-4">
      <h2 className="text-xl font-bold">Actividad global</h2>
      <div className="flex flex-wrap gap-3">{Object.entries(reports.totals).map(([key, value]) => <p key={key} className="rounded-xl border p-3"><strong>{value}</strong> {key}</p>)}</div>
      <h3 className="font-bold">Por sala</h3>
      {reports.byRoom.map((row) => <p key={row.room}>{row.room || 'Sin sala'}: {row.books} libros, {row.pages} páginas, {row.documents} documentos</p>)}
      <h3 className="font-bold">Páginas por mes</h3>
      {reports.monthly.map((row) => <p key={row.month}>{row.month}: {row.pages}</p>)}
    </section>}
    {tab === 'archive' && <section className="space-y-4">
      <h2 className="text-xl font-bold">Escaneos de todo el personal</h2>
      {archiveLoading && <p role="status">Cargando archivo…</p>}
      {archive.map((scan) => <details key={scan.id} className="rounded-xl border p-3"><summary>{scan.groupTitle || scan.title || `Página ${scan.id}`} · {scan.userName} · {scan.room}</summary><p className="whitespace-pre-wrap">{scan.text}</p>{user.role === 'admin' && <button onClick={() => remove('scan', scan.id)} className="mt-2 text-cardinal-dark underline">Borrar escaneo</button>}</details>)}
      <h2 className="text-xl font-bold">Documentos de todo el personal</h2>
      {documents.map((doc) => <details key={doc.id} className="rounded-xl border p-3"><summary>{doc.title} · {doc.userName} · {doc.room}</summary><p className="whitespace-pre-wrap">{doc.text}</p>{user.role === 'admin' && <button onClick={() => remove('document', doc.id)} className="mt-2 text-cardinal-dark underline">Borrar documento</button>}</details>)}
    </section>}
    <Link to="/" className="underline">Volver al inicio</Link>
  </main>;
}
