import clsx from 'clsx';
import { BookOpen, Check, ChevronDown, Cpu, FileText, KeyRound, Plus, Sparkles, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Input, Toggle } from '../components/ui';
import { ENGINES, GROUP_COLORS, GROUP_STYLES, LANGUAGES } from '../lib/constants';
import type { Engine, Group, GroupColor } from '../lib/types';

export type Mode = 'individual' | 'group';
export const NEW_GROUP = 'new';

/**
 * Botón grande de un paso: muestra lo elegido y, al pulsarlo, abre sus opciones
 * a lo ancho, debajo de los dos pasos.
 */
export function StepHeader({
  step,
  title,
  shortTitle,
  summary,
  icon,
  open,
  onToggle,
  warning,
}: {
  step: number;
  title: string;
  /** Título corto para móvil, donde los dos pasos van lado a lado. */
  shortTitle: string;
  summary: ReactNode;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  warning?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={clsx(
        'flex w-full items-center gap-2 rounded-2xl border-2 border-b-4 p-2.5 text-left transition active:translate-y-[2px] active:border-b-2 sm:gap-3 sm:p-4',
        open ? 'border-macaw bg-macaw-light' : 'border-swan bg-white hover:bg-polar',
      )}
    >
      <span className="relative shrink-0">
        <span className="flex size-10 items-center justify-center rounded-xl bg-polar text-eel sm:size-12 sm:rounded-2xl [&>svg]:size-6 sm:[&>svg]:size-7">{icon}</span>
        <span className="absolute -left-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-macaw text-[11px] font-black text-white shadow-[0_2px_0_#1899d6] sm:size-6 sm:text-xs">
          {step}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-extrabold uppercase tracking-wide text-hare sm:text-xs">
          <span className="sm:hidden">{shortTitle}</span>
          <span className="hidden sm:inline">{title}</span>
        </span>
        {/* En móvil el resumen ocupa hasta dos líneas porque los pasos van lado a lado */}
        <span className={clsx('line-clamp-2 text-sm font-black leading-tight sm:line-clamp-1 sm:text-lg', warning ? 'text-bee-dark' : 'text-eel')}>
          {summary}
        </span>
      </span>
      <span className={clsx('hidden text-sm font-extrabold uppercase lg:block', open ? 'text-macaw-dark' : 'text-macaw')}>
        {open ? 'Listo' : 'Cambiar'}
      </span>
      <ChevronDown className={clsx('size-5 shrink-0 text-hare transition sm:size-6', open && 'rotate-180 text-macaw-dark')} />
    </button>
  );
}

/** Panel desplegado de un paso, a todo lo ancho. */
export function StepPanel({ children }: { children: ReactNode }) {
  return <div className="space-y-4 rounded-3xl border-2 border-macaw/40 bg-white p-4 sm:p-5">{children}</div>;
}

/** Opción grande seleccionable, como las respuestas de una lección de Duolingo. */
export function ChoiceCard({
  selected,
  onSelect,
  icon,
  iconClass,
  title,
  description,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  iconClass: string;
  title: string;
  description: string;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={clsx(
        'relative flex w-full items-center gap-3 rounded-2xl border-2 border-b-4 p-3 text-left transition active:translate-y-[2px] active:border-b-2',
        selected ? 'border-macaw bg-macaw-light' : 'border-swan bg-white hover:bg-polar',
      )}
    >
      <span className={clsx('flex size-12 shrink-0 items-center justify-center rounded-xl [&>svg]:size-7', iconClass)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={clsx('block font-extrabold', selected ? 'text-macaw-dark' : 'text-eel')}>{title}</span>
        <span className="block text-sm leading-snug text-wolf">{description}</span>
        {badge && <span className="mt-1 block">{badge}</span>}
      </span>
      <span
        className={clsx(
          'flex size-7 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-macaw bg-macaw text-white' : 'border-swan',
        )}
      >
        {selected && <Check className="size-4" strokeWidth={3} />}
      </span>
    </button>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'inline-flex shrink-0 items-center gap-2 rounded-2xl border-2 border-b-4 px-3 py-2 text-sm font-extrabold transition active:translate-y-[2px] active:border-b-2',
        selected ? 'border-macaw bg-macaw-light text-macaw-dark' : 'border-swan bg-white text-wolf hover:bg-polar',
      )}
    >
      {children}
    </button>
  );
}

export interface DestinationProps {
  mode: Mode;
  setMode: (m: Mode) => void;
  groups: Group[];
  groupId: string;
  setGroupId: (id: string) => void;
  newTitle: string;
  setNewTitle: (t: string) => void;
  newColor: GroupColor;
  setNewColor: (c: GroupColor) => void;
}

export function destinationSummary({ mode, groups, groupId, newTitle }: DestinationProps) {
  if (mode === 'individual') return 'Páginas sueltas';
  if (groupId === NEW_GROUP) return newTitle ? `Grupo nuevo: ${newTitle}` : 'Grupo nuevo';
  return `Grupo: ${groups.find((g) => String(g.id) === groupId)?.title ?? ''}`;
}

export function DestinationPanel(props: DestinationProps) {
  const { mode, groups, groupId } = props;
  const selectedGroup = groups.find((g) => String(g.id) === groupId);

  return (
    <StepPanel>
      <div className="grid gap-2 md:grid-cols-2">
        <ChoiceCard
          selected={mode === 'individual'}
          onSelect={() => props.setMode('individual')}
          icon={<FileText />}
          iconClass="bg-beetle-light text-beetle-dark"
          title="Páginas sueltas"
          description="Cada foto se guarda como un escaneo individual."
        />
        <ChoiceCard
          selected={mode === 'group'}
          onSelect={() => props.setMode('group')}
          icon={<BookOpen />}
          iconClass="bg-feather-light text-feather-dark"
          title="Libro o grupo"
          description="Las fotos se guardan juntas y en orden."
        />
      </div>

      {mode === 'group' && (
        <div className="space-y-3 rounded-2xl bg-polar p-3">
          <div className="text-sm font-extrabold">Elige el grupo</div>
          <div className="-mx-1 flex flex-wrap gap-2 px-1" role="group" aria-label="Grupo">
            <Chip selected={groupId === NEW_GROUP} onClick={() => props.setGroupId(NEW_GROUP)}>
              <Plus className="size-4" /> Nuevo
            </Chip>
            {groups.map((g) => (
              <Chip key={g.id} selected={groupId === String(g.id)} onClick={() => props.setGroupId(String(g.id))}>
                <span className={clsx('size-3 rounded-full', GROUP_STYLES[g.color].bg)} />
                <span className="max-w-48 truncate">{g.title}</span>
              </Chip>
            ))}
          </div>
          {groupId === NEW_GROUP ? (
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <Input
                value={props.newTitle}
                onChange={(e) => props.setNewTitle(e.target.value)}
                placeholder="Ej. Cien años de soledad"
                maxLength={160}
                aria-label="Nombre del grupo nuevo"
                className="md:flex-1"
              />
              <div className="flex flex-wrap gap-2">
                {GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    aria-pressed={props.newColor === c}
                    onClick={() => props.setNewColor(c)}
                    className={clsx('size-9 rounded-full', GROUP_STYLES[c].bg, props.newColor === c && 'ring-4 ring-macaw/40 ring-offset-2')}
                  />
                ))}
              </div>
            </div>
          ) : (
            selectedGroup && (
              <p className="text-sm text-wolf">
                Las páginas se añadirán al final de «{selectedGroup.title}» ({selectedGroup.scanCount ?? 0} ya guardadas).
              </p>
            )
          )}
        </div>
      )}
    </StepPanel>
  );
}

const ENGINE_ICON: Record<Engine, { icon: ReactNode; className: string }> = {
  ocrspace: { icon: <Zap />, className: 'bg-bee-light text-bee-dark' },
  gemini: { icon: <Sparkles />, className: 'bg-beetle-light text-beetle-dark' },
  tesseract: { icon: <Cpu />, className: 'bg-macaw-light text-macaw-dark' },
};

export interface EngineProps {
  engine: Engine;
  setEngine: (e: Engine) => void;
  language: string;
  setLanguage: (l: string) => void;
  autoScan: boolean;
  setAutoScan: (v: boolean) => void;
  keysReady: Record<Engine, boolean>;
}

export function engineSummary({ engine, language, autoScan, keysReady }: EngineProps) {
  if (!keysReady[engine]) return `${ENGINES[engine].label} · sin API key`;
  const lang = LANGUAGES.find((l) => l.code === language)?.label ?? language;
  return `${ENGINES[engine].label} · ${lang}${autoScan ? ' · automático' : ''}`;
}

export function EnginePanel(props: EngineProps) {
  return (
    <StepPanel>
      <div className="grid gap-2 md:grid-cols-3">
        {(Object.keys(ENGINES) as Engine[]).map((e) => (
          <ChoiceCard
            key={e}
            selected={props.engine === e}
            onSelect={() => props.setEngine(e)}
            icon={ENGINE_ICON[e].icon}
            iconClass={ENGINE_ICON[e].className}
            title={ENGINES[e].label}
            description={ENGINES[e].description}
            badge={
              props.keysReady[e] ? (
                <span className="inline-flex items-center gap-1 text-xs font-extrabold text-feather-dark">
                  <Check className="size-3.5" strokeWidth={3} /> {ENGINES[e].online ? 'Listo' : 'Sin internet'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-extrabold text-bee-dark">
                  <KeyRound className="size-3.5" /> Falta la API key
                </span>
              )
            }
          />
        ))}
      </div>
      {!props.keysReady[props.engine] && (
        <p className="rounded-2xl bg-bee-light p-3 text-sm font-semibold">
          Para usar {ENGINES[props.engine].label} necesitas su API key.{' '}
          <Link to="/ajustes" className="font-extrabold text-macaw">
            Configurarla
          </Link>{' '}
          o elige Tesseract, que funciona sin clave.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <div className="mb-2 text-sm font-extrabold">Idioma del texto</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Idioma del texto">
            {LANGUAGES.map((l) => (
              <Chip key={l.code} selected={props.language === l.code} onClick={() => props.setLanguage(l.code)}>
                {l.label}
              </Chip>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-swan p-3 md:max-w-sm">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bee-light text-bee-dark">
            <Zap className="size-5" fill="currentColor" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-extrabold">Escaneo automático</span>
            <span className="block text-sm text-wolf">{props.autoScan ? 'Cada foto se escanea al tomarla.' : 'Tomas las fotos y escaneas cuando quieras.'}</span>
          </span>
          <Toggle checked={props.autoScan} onChange={props.setAutoScan} label="Escaneo automático" />
        </label>
      </div>
    </StepPanel>
  );
}

export const destinationIcon = (mode: Mode) => (mode === 'group' ? <BookOpen /> : <FileText />);
export const engineIcon = (engine: Engine) => ENGINE_ICON[engine].icon;
