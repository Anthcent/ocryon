import clsx from 'clsx';
import { BookOpen, ChevronRight, FileText, BarChart3, ScanLine, Type, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Mascot } from '../components/Logo';
import { Button, Card, EmptyState, PageLoader } from '../components/ui';
import { api } from '../lib/api';
import { GROUP_STYLES } from '../lib/constants';
import { formatNumber, timeAgo } from '../lib/format';
import type { Stats } from '../lib/types';
import { useScanSession } from '../scan/ScanSession';
import { useSettings } from '../settings/SettingsContext';

const WEEKDAY = new Intl.DateTimeFormat('es', { weekday: 'narrow', timeZone: 'UTC' });

export function HomePage() {
  const { user } = useAuth();
  const { settings, loaded } = useSettings();
  const { pages } = useScanSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setFailed(false);
    api
      .stats()
      .then(setStats)
      .catch(() => setFailed(true));
  };
  useEffect(load, []);

  if (failed) {
    return (
      <EmptyState icon={<WifiOff className="size-10" />} title="No se pudo cargar el inicio" action={<Button onClick={load}>Reintentar</Button>}>
        Revisa tu conexión con el servidor.
      </EmptyState>
    );
  }
  if (!stats) return <PageLoader />;

  const noKeys = loaded && !settings.keys.ocrspace.configured && !settings.keys.gemini.configured;
  const maxDay = Math.max(1, ...stats.week.map((d) => d.count));
  const weekTotal = stats.week.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-6">
      {/* Saludo */}
      <div className="relative flex items-center gap-4 overflow-hidden rounded-[2rem] border-b-[6px] border-feather-dark bg-gradient-to-br from-feather via-[#6bd40a] to-[#89e219] p-5 text-white sm:p-7">
        <span className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full bg-white/15" />
        <span className="pointer-events-none absolute -bottom-16 right-28 size-32 rounded-full bg-white/10" />
        <Mascot className="relative size-16 shrink-0 rounded-2xl shadow-lg ring-4 ring-white/40 sm:size-20" />
        <div className="relative">
          <h1 className="text-2xl font-black sm:text-4xl">¡Hola, {user?.name.split(' ')[0]}!</h1>
          <p className="font-bold text-white/90">{stats.totals.scans === 0 ? 'Escanea tu primera página para empezar.' : '¿Qué vamos a escanear hoy?'}</p>
        </div>
      </div>

      {pages.length > 0 && (
        <Link to="/escanear">
          <Card interactive className="flex items-center gap-4 border-macaw/60 bg-macaw-light p-4">
            <ScanLine className="size-8 text-macaw-dark" />
            <div className="flex-1">
              <div className="font-extrabold text-macaw-dark">Tienes {pages.length} {pages.length === 1 ? 'página' : 'páginas'} sin guardar</div>
              <div className="text-sm text-wolf">Continúa donde lo dejaste.</div>
            </div>
            <ChevronRight className="size-6 text-macaw-dark" />
          </Card>
        </Link>
      )}

      {noKeys && (
        <Card className="flex flex-col gap-3 border-bee bg-bee-light p-4 sm:flex-row sm:items-center">
          <p className="flex-1 font-semibold">
            Configura tu API key de OCR.space o Gemini para escanear con la mejor calidad. Mientras tanto puedes usar Tesseract.
          </p>
          <Link to="/ajustes">
            <Button variant="warning" size="sm">
              Ir a ajustes
            </Button>
          </Link>
        </Card>
      )}

      {/* Actividad de la semana: hojas escaneadas por día */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-macaw-light text-macaw-dark">
            <BarChart3 className="size-8" />
          </div>
          <div>
            <div className="text-2xl font-black">
              {weekTotal} {weekTotal === 1 ? 'hoja escaneada' : 'hojas escaneadas'}
            </div>
            <div className="text-sm text-wolf">
              {weekTotal > 0 ? 'Tu actividad de los últimos 7 días.' : 'Esta semana aún no has escaneado nada.'}
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-7 gap-2">
          {stats.week.map((d, i) => {
            const today = i === stats.week.length - 1;
            return (
              <div key={d.day} className="flex flex-col items-center gap-1.5">
                <span className="h-4 text-xs font-black text-macaw-dark">{d.count > 0 ? d.count : ''}</span>
                <div className="flex h-20 w-full items-end overflow-hidden rounded-xl bg-polar">
                  <div
                    className={clsx('w-full rounded-xl', d.count > 0 ? 'bg-macaw shadow-[inset_0_-4px_0_#1899d6]' : 'bg-transparent')}
                    style={{ height: `${(d.count / maxDay) * 100}%` }}
                    title={`${d.count} hojas`}
                  />
                </div>
                <span className={clsx('text-xs font-extrabold uppercase', today ? 'text-macaw-dark' : 'text-hare')}>
                  {today ? 'Hoy' : WEEKDAY.format(new Date(`${d.day}T12:00:00Z`))}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<ScanLine />} tone="text-feather" label="Escaneos" value={stats.totals.scans} />
        <StatTile icon={<BookOpen />} tone="text-macaw" label="Grupos" value={stats.totals.groups} />
        <StatTile icon={<FileText />} tone="text-beetle" label="Individuales" value={stats.totals.individual} />
        <StatTile icon={<Type />} tone="text-fox" label="Palabras" value={stats.totals.words} />
      </div>

      <Link to="/escanear" className="block">
        <Button block size="lg" icon={<ScanLine className="size-6" />}>
          Empezar a escanear
        </Button>
      </Link>

      {stats.recentGroups.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-black">Tus grupos recientes</h2>
            <Link to="/catalogo" className="text-sm font-extrabold uppercase text-macaw">
              Ver todo
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {stats.recentGroups.map((g) => (
              <Link key={g.id} to={`/catalogo/grupo/${g.id}`}>
                <Card interactive className="flex items-center gap-4 p-4">
                  <div className={clsx('flex size-12 shrink-0 items-center justify-center rounded-2xl text-white', GROUP_STYLES[g.color].bg)}>
                    <BookOpen className="size-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-extrabold">{g.title}</div>
                    <div className="text-sm text-wolf">
                      {g.scanCount} {g.scanCount === 1 ? 'página' : 'páginas'} · {timeAgo(g.updatedAt)}
                    </div>
                  </div>
                  <ChevronRight className="size-5 text-hare" />
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const TILE_TONES: Record<string, string> = {
  'text-feather': 'border-feather/50 bg-feather-light',
  'text-macaw': 'border-macaw/50 bg-macaw-light',
  'text-beetle': 'border-beetle/50 bg-beetle-light',
  'text-fox': 'border-fox/50 bg-fox-light',
};

function StatTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className={clsx('rounded-2xl border-2 border-b-4 p-4', TILE_TONES[tone])}>
      <div className={clsx('mb-2 flex size-10 items-center justify-center rounded-xl bg-white shadow-sm [&>svg]:size-6', tone)}>{icon}</div>
      <div className="text-2xl font-black">{formatNumber(value)}</div>
      <div className="text-sm font-bold text-wolf">{label}</div>
    </div>
  );
}
