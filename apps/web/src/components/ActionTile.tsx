import clsx from 'clsx';
import type { ReactNode } from 'react';

const TONES = {
  green: 'bg-feather-light text-feather-dark',
  blue: 'bg-macaw-light text-macaw-dark',
  purple: 'bg-beetle-light text-beetle-dark',
  orange: 'bg-fox-light text-fox-dark',
  red: 'bg-cardinal-light text-cardinal-dark',
  gray: 'bg-polar text-wolf',
};

/** Botón de acción grande con icono en un cuadro de color, como las fichas de Duolingo. */
export function ActionTile({
  icon,
  label,
  shortLabel,
  tone = 'gray',
  onClick,
  disabled,
  compact,
}: {
  icon: ReactNode;
  label: string;
  /** Etiqueta corta para pantallas pequeñas; el nombre accesible sigue siendo `label`. */
  shortLabel?: string;
  tone?: keyof typeof TONES;
  onClick: () => void;
  disabled?: boolean;
  /** En móvil las fichas van en fila y se muestran más pequeñas. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        'flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border-2 border-b-4 border-swan bg-white text-center transition hover:bg-polar active:translate-y-[2px] active:border-b-2 disabled:pointer-events-none disabled:opacity-40',
        compact ? 'px-1 py-2' : 'px-2 py-3',
      )}
    >
      <span className={clsx('flex items-center justify-center rounded-xl', TONES[tone], compact ? 'size-9 [&>svg]:size-5' : 'size-11 [&>svg]:size-6')}>
        {icon}
      </span>
      <span className={clsx('w-full truncate font-extrabold', compact ? 'text-[11px] sm:text-xs' : 'text-xs uppercase tracking-wide')}>
        {shortLabel ? (
          <>
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </span>
    </button>
  );
}

/** Barra de progreso gruesa tipo lección, para indicar en qué página se está. */
export function LessonProgress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-4 flex-1 overflow-hidden rounded-full bg-swan">
        <div className="relative h-full rounded-full bg-feather transition-[width] duration-500" style={{ width: `${Math.max(3, Math.min(100, value))}%` }}>
          <div className="absolute inset-x-2 top-1 h-1 rounded-full bg-white/30" />
        </div>
      </div>
      {label && <span className="shrink-0 text-sm font-extrabold text-wolf">{label}</span>}
    </div>
  );
}
