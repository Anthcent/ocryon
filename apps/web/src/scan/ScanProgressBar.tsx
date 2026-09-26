import clsx from 'clsx';
import type { ScanProgress } from './ScanSession';

/**
 * Barra de progreso de una página que se está escaneando, al estilo de las lecciones de Duolingo:
 * gruesa, redondeada y con un brillo encima.
 */
export function ScanProgressBar({ progress, size = 'md', dark }: { progress?: ScanProgress; size?: 'sm' | 'md'; dark?: boolean }) {
  const value = progress?.value ?? 0;
  const percent = Math.round(value * 100);
  return (
    <div
      role="progressbar"
      aria-label={progress?.label ?? 'Escaneando'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="w-full"
    >
      {size === 'md' && (
        <div className={clsx('mb-1 flex items-center justify-between text-xs font-extrabold', dark ? 'text-white' : 'text-eel')}>
          <span className="truncate">{progress?.label ?? 'Escaneando…'}</span>
          <span className="shrink-0 tabular-nums text-macaw-dark">{percent}%</span>
        </div>
      )}
      <div className={clsx('w-full overflow-hidden rounded-full', size === 'md' ? 'h-3.5' : 'h-2', dark ? 'bg-white/25' : 'bg-swan')}>
        <div className="relative h-full rounded-full bg-macaw transition-[width] duration-300 ease-out" style={{ width: `${Math.max(4, percent)}%` }}>
          {size === 'md' && <div className="absolute inset-x-1.5 top-[3px] h-1 rounded-full bg-white/35" />}
        </div>
      </div>
    </div>
  );
}
