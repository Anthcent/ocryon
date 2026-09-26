import clsx from 'clsx';
import { BookOpen, ChevronRight, FileText, Flame, ScanLine, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Mascot } from '../components/Logo';
import { Button, Card, PageLoader } from '../components/ui';
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

  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
  }, []);

  if (!stats) return <PageLoader />;

  const noKeys = loaded && !settings.keys.ocrspace.configured && !settings.keys.gemini.configured;
  const maxDay = Math.max(1, ...stats.week.map((d) => d.count));

  return (
    <div className="space-y-6">
      {/* Saludo */}
      <div className="flex items-center gap-4">
        <Mascot className="size-16 shrink-0" />
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">¡Hola, {user?.name.split(' ')[0]}!</h1>
          <p className="text-wolf">{stats.totals.scans === 0 ? 'Escanea tu primera página para empezar.' : '¿Qué vamos a escanear hoy?'}</p>
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

      {/* Racha y semana */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className={clsx('flex size-14 items-center justify-center rounded-2xl', stats.streak > 0 ? 'bg-fox-light text-fox' : 'bg-polar text-hare')}>
            <Flame className="size-8" fill="currentColor" />
          </div>
          <div>
            <div className="text-2xl font-black">
              {stats.streak} {stats.streak === 1 ? 'día' : 'días'} de racha
            </div>
            <div className="text-sm text-wolf">{stats.streak > 0 ? '¡Sigue así! Escanea hoy para no perderla.' : 'Escanea hoy para empezar una racha.'}</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-7 gap-2">
          {stats.week.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-1.5">
              <div className="flex h-20 w-full items-end overflow-hidden rounded-xl bg-polar">
                <div
                  className={clsx('w-full rounded-xl', d.count > 0 ? 'bg-fox' : 'bg-transparent')}
                  style={{ height: `${(d.count / maxDay) * 100}%` }}
                  title={`${d.count} escaneos`}
                />
              </div>
              <span className="text-xs font-extrabold uppercase text-hare">{WEEKDAY.format(new Date(`${d.day}T12:00:00Z`))}</span>
            </div>
          ))}
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
          <div className="grid gap-3 sm:grid-cols-2">
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

function StatTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <Card className="p-4">
      <div className={clsx('mb-2 [&>svg]:size-6', tone)}>{icon}</div>
      <div className="text-2xl font-black">{formatNumber(value)}</div>
      <div className="text-sm font-bold text-wolf">{label}</div>
    </Card>
  );
}
