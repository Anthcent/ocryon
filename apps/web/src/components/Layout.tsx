import clsx from 'clsx';
import { BookOpen, BookOpenText, FileScan, FileText, House, Library, LogOut, Plus, ScanLine, Search, Settings, Type } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { GROUP_STYLES } from '../lib/constants';
import { formatNumber } from '../lib/format';
import type { Stats } from '../lib/types';
import { useScanSession } from '../scan/ScanSession';
import { LessonProgress } from './ActionTile';
import { BookCover } from './BookCover';
import { Logo } from './Logo';

/** Cada sección tiene su color, como las unidades de Duolingo. */
const NAV = [
  { to: '/', label: 'Inicio', icon: House, end: true, tone: 'text-feather-dark bg-feather-light', active: 'border-feather bg-feather-light text-feather-dark' },
  { to: '/escanear', label: 'Escanear', icon: ScanLine, tone: 'text-macaw-dark bg-macaw-light', active: 'border-macaw bg-macaw-light text-macaw-dark' },
  { to: '/catalogo', label: 'Catálogo', icon: Library, tone: 'text-fox-dark bg-fox-light', active: 'border-fox bg-fox-light text-fox-dark' },
  { to: '/documentos', label: 'Documentos', icon: FileScan, tone: 'text-cardinal-dark bg-cardinal-light', active: 'border-cardinal bg-cardinal-light text-cardinal-dark' },
  { to: '/buscar', label: 'Buscar', icon: Search, tone: 'text-beetle-dark bg-beetle-light', active: 'border-beetle bg-beetle-light text-beetle-dark' },
  { to: '/ajustes', label: 'Ajustes', icon: Settings, tone: 'text-wolf bg-polar', active: 'border-hare bg-polar text-eel' },
];

const MOBILE_ACTIVE: Record<string, string> = {
  '/': 'text-feather-dark bg-feather-light',
  '/catalogo': 'text-fox-dark bg-fox-light',
  '/documentos': 'text-cardinal-dark bg-cardinal-light',
  '/buscar': 'text-beetle-dark bg-beetle-light',
};

/** En móvil el botón de escanear va en el centro; Ajustes pasa a la barra superior. */
const MOBILE_NAV = ['/', '/catalogo', '/escanear', '/documentos', '/buscar'].map((to) => NAV.find((n) => n.to === to)!);

/** Estadísticas del usuario para la barra superior; se refrescan al cambiar de pantalla. */
function useStats() {
  const location = useLocation();
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
  }, [location.pathname]);
  return stats;
}

function StatChip({
  icon,
  value,
  label,
  className,
  from,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  className: string;
  /** Tamaño de pantalla a partir del cual se muestra (en móvil solo caben dos). */
  from?: 'sm' | 'md';
}) {
  return (
    <span
      title={label}
      aria-label={`${label}: ${value}`}
      className={clsx(
        'items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-black',
        from === 'sm' ? 'hidden sm:inline-flex' : from === 'md' ? 'hidden md:inline-flex' : 'inline-flex',
        className,
      )}
    >
      {icon}
      {value}
    </span>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const stats = useStats();
  const pendingPages = useScanSession().pages.length;

  return (
    <div className="min-h-dvh bg-white lg:pl-72">
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r-2 border-swan bg-white px-4 py-6 lg:flex">
        <Logo className="mb-8 px-3" />
        <nav className="flex flex-col gap-1.5">
          {NAV.map(({ to, label, icon: Icon, end, tone, active }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-3 rounded-2xl border-2 px-3 py-2 text-sm font-extrabold uppercase tracking-wide transition',
                  isActive ? active : 'border-transparent text-wolf hover:bg-polar',
                )
              }
            >
              <span className={clsx('flex size-10 items-center justify-center rounded-xl transition group-hover:scale-105', tone)}>
                <Icon className="size-6" strokeWidth={2.5} />
              </span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Libro en el que se trabajó por última vez */}
        <ContinueCard stats={stats} />

        <div className="mt-auto flex items-center gap-3 rounded-2xl border-2 border-swan p-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-beetle to-macaw text-lg font-black text-white">
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold">{user?.name}</div>
            <div className="truncate text-xs text-wolf">{user?.email}</div>
          </div>
          <button onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" className="rounded-lg p-2 text-hare hover:bg-polar hover:text-cardinal">
            <LogOut className="size-5" />
          </button>
        </div>
      </aside>

      {/* Barra superior: logo en móvil y estadísticas siempre a la vista */}
      <header className="sticky top-0 z-30 border-b-2 border-swan bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6 lg:h-16">
          <Logo className="lg:hidden" />
          <div className="ml-auto flex items-center gap-1 sm:gap-2" data-testid="top-stats">
            {pendingPages > 0 && (
              <Link
                to="/escanear"
                title="Hojas en el escáner sin guardar"
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-b-4 border-bee-dark bg-bee px-2.5 py-1 text-sm font-black text-eel transition active:translate-y-[2px] active:border-b-2"
              >
                <ScanLine className="size-4" /> {pendingPages} <span className="hidden sm:inline">sin guardar</span>
              </Link>
            )}
            <StatChip icon={<FileText className="size-5" />} value={formatNumber(stats?.totals.scans ?? 0)} label="Escaneos" className="text-macaw" />
            <StatChip icon={<BookOpen className="size-5" />} value={formatNumber(stats?.totals.groups ?? 0)} label="Libros" className="text-feather-dark" from="sm" />
            <StatChip icon={<Type className="size-5" />} value={formatNumber(stats?.totals.words ?? 0)} label="Palabras" className="text-beetle-dark" from="md" />
            <NavLink
              to="/ajustes"
              aria-label="Ajustes"
              className={({ isActive }) => clsx('rounded-xl p-2 transition lg:hidden', isActive ? 'bg-polar text-eel' : 'text-hare hover:bg-polar')}
            >
              <Settings className="size-6" strokeWidth={2.5} />
            </NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-8">
        <Outlet />
      </main>

      {/* Navegación inferior (móvil) */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t-2 border-swan bg-white lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-1">
          {MOBILE_NAV.map(({ to, label, icon: Icon, end }) =>
            to === '/escanear' ? (
              <NavLink key={to} to={to} aria-label={label} className="flex justify-center">
                <span className="-mt-7 flex size-16 items-center justify-center rounded-full border-4 border-white bg-feather text-white shadow-[0_4px_0_#58a700] transition active:translate-y-1 active:shadow-none">
                  <ScanLine className="size-8" strokeWidth={2.5} />
                </span>
              </NavLink>
            ) : (
              <NavLink key={to} to={to} end={end} className="flex justify-center">
                {({ isActive }) => (
                  <span
                    className={clsx(
                      'flex flex-col items-center gap-0.5 rounded-2xl px-2 py-1 text-[11px] font-extrabold transition',
                      isActive ? MOBILE_ACTIVE[to] : 'text-hare',
                    )}
                  >
                    <Icon className="size-6" strokeWidth={2.5} />
                    {label}
                  </span>
                )}
              </NavLink>
            ),
          )}
        </div>
      </nav>
    </div>
  );
}

/** Tarjeta del menú lateral: acceso rápido al último libro en el que se trabajó. */
function ContinueCard({ stats }: { stats: Stats | null }) {
  const book = stats?.recentGroups[0];
  if (!stats) return null;
  if (!book) {
    return (
      <div className="mt-6 rounded-2xl border-2 border-b-4 border-macaw/40 bg-macaw-light p-4">
        <div className="font-black text-macaw-dark">Empieza tu biblioteca</div>
        <p className="mt-1 text-sm text-wolf">Escanea las páginas de un libro y guárdalas juntas.</p>
        <Link
          to="/escanear"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border-2 border-b-4 border-macaw-dark bg-macaw py-2 text-xs font-extrabold uppercase text-white active:translate-y-[2px] active:border-b-2"
        >
          <ScanLine className="size-4" /> Escanear un libro
        </Link>
      </div>
    );
  }
  const style = GROUP_STYLES[book.color];
  return (
    <div className={clsx('mt-6 rounded-2xl border-2 border-b-4 p-3', style.soft, style.border)} data-testid="continue-card">
      <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-wolf">Sigue con tu libro</div>
      <Link to={`/catalogo/grupo/${book.id}`} className="flex items-center gap-3">
        <BookCover group={book} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-black leading-tight">{book.title}</div>
          {book.author && <div className={clsx('truncate text-xs font-extrabold', style.text)}>{book.author}</div>}
          <div className="mt-1 text-xs font-bold text-wolf">
            {book.scanCount} {book.scanCount === 1 ? 'hoja' : 'hojas'}
            {book.totalPages ? ` de ${book.totalPages}` : ''}
          </div>
        </div>
      </Link>
      {book.totalPages ? (
        <div className="mt-2">
          <LessonProgress value={(book.scanCount / book.totalPages) * 100} />
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          to={`/catalogo/grupo/${book.id}?libro=1`}
          className="flex items-center justify-center gap-1 rounded-xl border-2 border-b-4 border-feather-dark bg-feather py-1.5 text-[11px] font-extrabold uppercase text-white active:translate-y-[2px] active:border-b-2"
        >
          <BookOpenText className="size-3.5" /> Leer
        </Link>
        <Link
          to={`/escanear?grupo=${book.id}`}
          className="flex items-center justify-center gap-1 rounded-xl border-2 border-b-4 border-swan bg-white py-1.5 text-[11px] font-extrabold uppercase text-wolf active:translate-y-[2px] active:border-b-2"
        >
          <Plus className="size-3.5" /> Hojas
        </Link>
      </div>
    </div>
  );
}
