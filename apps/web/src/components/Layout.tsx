import clsx from 'clsx';
import { House, Library, LogOut, ScanLine, Search, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Logo } from './Logo';

const NAV = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/escanear', label: 'Escanear', icon: ScanLine },
  { to: '/catalogo', label: 'Catálogo', icon: Library },
  { to: '/buscar', label: 'Buscar', icon: Search },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r-2 border-swan bg-white px-4 py-6 lg:flex">
        <Logo className="mb-8 px-3" />
        <nav className="flex flex-1 flex-col gap-1.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-4 rounded-2xl border-2 px-4 py-3 text-sm font-extrabold uppercase tracking-wide transition',
                  isActive ? 'border-macaw/60 bg-macaw-light text-macaw-dark' : 'border-transparent text-wolf hover:bg-polar',
                )
              }
            >
              <Icon className="size-6" strokeWidth={2.5} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 flex items-center gap-3 rounded-2xl border-2 border-swan p-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-beetle text-lg font-black text-white">
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

      {/* Cabecera (móvil) */}
      <header className="sticky top-0 z-30 flex h-14 items-center border-b-2 border-swan bg-white/95 px-4 backdrop-blur lg:hidden">
        <Logo />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-10">
        <Outlet />
      </main>

      {/* Navegación inferior (móvil) */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t-2 border-swan bg-white lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          {NAV.map(({ to, label, icon: Icon, end }) =>
            to === '/escanear' ? (
              <NavLink key={to} to={to} aria-label={label} className="flex justify-center">
                <span className="-mt-7 flex size-16 items-center justify-center rounded-full border-4 border-white bg-feather text-white shadow-[0_4px_0_#58a700] transition active:translate-y-1 active:shadow-none">
                  <ScanLine className="size-8" strokeWidth={2.5} />
                </span>
              </NavLink>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx('flex flex-col items-center gap-0.5 text-[11px] font-extrabold', isActive ? 'text-macaw' : 'text-hare')
                }
              >
                <Icon className="size-6" strokeWidth={2.5} />
                {label}
              </NavLink>
            ),
          )}
        </div>
      </nav>
    </div>
  );
}
