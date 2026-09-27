import clsx from 'clsx';
import { LoaderCircle, X } from 'lucide-react';
import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning' | 'plain';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-feather text-white border-feather-dark hover:bg-[#61e002]',
  secondary: 'bg-macaw text-white border-macaw-dark hover:bg-[#20bdff]',
  danger: 'bg-cardinal text-white border-cardinal-dark hover:bg-[#ff5c5c]',
  warning: 'bg-bee text-eel border-bee-dark hover:bg-[#ffd21f]',
  ghost: 'bg-white text-macaw border-swan hover:bg-polar',
  plain: 'bg-white text-wolf border-swan hover:bg-polar',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

/** Botón "3D" al estilo Duolingo: borde inferior grueso que se hunde al pulsar. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 rounded-2xl border-2 border-b-4 font-extrabold uppercase tracking-wide transition-[transform,background-color,border-width] duration-75',
        'active:translate-y-[2px] active:border-b-2 disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-macaw/30',
        size === 'sm' && 'h-9 px-3 text-xs',
        size === 'md' && 'h-12 px-5 text-sm',
        size === 'lg' && 'h-14 px-6 text-base',
        block && 'w-full',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex size-10 items-center justify-center rounded-xl text-wolf transition hover:bg-polar hover:text-eel active:scale-95 disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, interactive }: { className?: string; children: ReactNode; interactive?: boolean }) {
  return (
    <div
      className={clsx(
        'rounded-2xl border-2 border-swan bg-white',
        interactive && 'border-b-4 transition hover:bg-polar active:translate-y-[2px] active:border-b-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-extrabold text-eel">{label}</span>
      {children}
      {error ? <span className="block text-sm font-bold text-cardinal">{error}</span> : hint && <span className="block text-sm text-wolf">{hint}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-2xl border-2 border-swan bg-polar px-4 py-3 text-base font-semibold text-eel placeholder:text-hare outline-none transition focus:border-macaw focus:bg-white';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={clsx(inputClass, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={clsx(inputClass, 'leading-relaxed', className)} {...props} />;
});

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(inputClass, 'appearance-none bg-[length:1.25rem] pr-10', className)} {...props}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-8 w-14 shrink-0 rounded-full border-2 transition-colors',
        checked ? 'border-feather-dark bg-feather' : 'border-swan bg-swan',
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left]',
          checked ? 'left-[calc(100%-1.625rem)]' : 'left-0.5',
        )}
      />
    </button>
  );
}

/** Selector de opciones en forma de "pastillas" grandes, fácil de tocar en móvil. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={clsx(
            'flex items-center justify-center gap-2 rounded-2xl border-2 border-b-4 px-3 py-2.5 text-sm font-extrabold transition active:translate-y-[2px] active:border-b-2',
            value === o.value ? 'border-macaw bg-macaw-light text-macaw-dark' : 'border-swan bg-white text-wolf hover:bg-polar',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ children, tone = 'gray', className }: { children: ReactNode; tone?: 'gray' | 'green' | 'blue' | 'red' | 'yellow' | 'purple'; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide',
        tone === 'gray' && 'bg-polar text-wolf',
        tone === 'green' && 'bg-feather-light text-feather-dark',
        tone === 'blue' && 'bg-macaw-light text-macaw-dark',
        tone === 'red' && 'bg-cardinal-light text-cardinal-dark',
        tone === 'yellow' && 'bg-bee-light text-bee-dark',
        tone === 'purple' && 'bg-beetle-light text-beetle-dark',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={clsx('h-4 w-full overflow-hidden rounded-full bg-swan', className)}>
      <div
        className="relative h-full rounded-full bg-feather transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      >
        <div className="absolute inset-x-2 top-1 h-1 rounded-full bg-white/30" />
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx('animate-spin text-macaw', className ?? 'size-8')} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex size-20 items-center justify-center rounded-3xl bg-polar text-hare">{icon}</div>
      <h3 className="text-xl font-black text-eel">{title}</h3>
      {children && <p className="mt-2 max-w-sm text-wolf">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-black text-eel sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-wolf">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-eel/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={clsx('pb-safe max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-black">{title}</h2>
          <IconButton label="Cerrar" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
