import clsx from 'clsx';
import { BookOpen, Check, ChevronDown, Cpu, FileText, KeyRound, Plus, Sparkles, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Input, Toggle } from '../components/ui';
import { ENGINES, GROUP_COLORS, GROUP_STYLES, LANGUAGES } from '../lib/constants';
import type { Engine, Group, GroupColor } from '../lib/types';

export type Mode = 'individual' | 'group';
export const NEW_GROUP = 'new';

/** Tarjeta de paso numerada; en móvil se puede plegar para dejar sitio a las páginas. */
export function StepCard({
  step,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  step: number;
  title: string;
  summary: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border-2 border-swan bg-white">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left lg:pointer-events-none">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-macaw text-lg font-black text-white shadow-[0_3px_0_#1899d6]">
          {step}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-black leading-tight">{title}</span>
          {!open && <span className="block truncate text-sm font-bold text-macaw-dark lg:hidden">{summary}</span>}
        </span>
        <ChevronDown className={clsx('size-6 shrink-0 text-hare transition lg:hidden', open && 'rotate-180')} />
      </button>
      <div className={clsx('space-y-4 px-4 pb-4', !open && 'hidden lg:block')}>{children}</div>
    </section>
  );
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

function Chip({ selected, onClick, children, label }: { selected: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      className={clsx(
        'inline-flex shrink-0 items-center gap-2 rounded-2xl border-2 border-b-4 px-3 py-2 text-sm font-extrabold transition active:translate-y-[2px] active:border-b-2',
        selected ? 'border-macaw bg-macaw-light text-macaw-dark' : 'border-swan bg-white text-wolf hover:bg-polar',
      )}
    >
      {children}
    </button>
  );
}

export function DestinationStep(props: {
  open: boolean;
  onToggle: () => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  groups: Group[];
  groupId: string;
  setGroupId: (id: string) => void;
  newTitle: string;
  setNewTitle: (t: string) => void;
  newColor: GroupColor;
  setNewColor: (c: GroupColor) => void;
}) {
  const { mode, groups, groupId } = props;
  const selectedGroup = groups.find((g) => String(g.id) === groupId);
  const summary =
    mode === 'individual' ? 'Páginas sueltas' : groupId === NEW_GROUP ? `Grupo nuevo${props.newTitle ? `: ${props.newTitle}` : ''}` : `Grupo: ${selectedGroup?.title ?? ''}`;

  return (
    <StepCard step={1} title="¿Dónde se guarda?" summary={summary} open={props.open} onToggle={props.onToggle}>
      <div className="grid gap-2">
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
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Grupo">
            <Chip selected={groupId === NEW_GROUP} onClick={() => props.setGroupId(NEW_GROUP)}>
              <Plus className="size-4" /> Nuevo
            </Chip>
            {groups.map((g) => (
              <Chip key={g.id} selected={groupId === String(g.id)} onClick={() => props.setGroupId(String(g.id))}>
                <span className={clsx('size-3 rounded-full', GROUP_STYLES[g.color].bg)} />
                <span className="max-w-40 truncate">{g.title}</span>
              </Chip>
            ))}
          </div>
          {groupId === NEW_GROUP ? (
            <>
              <Input
                value={props.newTitle}
                onChange={(e) => props.setNewTitle(e.target.value)}
                placeholder="Ej. Cien años de soledad"
                maxLength={160}
                aria-label="Nombre del grupo nuevo"
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
            </>
          ) : (
            selectedGroup && (
              <p className="text-sm text-wolf">
                Las páginas se añadirán al final de «{selectedGroup.title}» ({selectedGroup.scanCount ?? 0} ya guardadas).
              </p>
            )
          )}
        </div>
      )}
    </StepCard>
  );
}

const ENGINE_ICON: Record<Engine, { icon: ReactNode; className: string }> = {
  ocrspace: { icon: <Zap />, className: 'bg-bee-light text-bee-dark' },
  gemini: { icon: <Sparkles />, className: 'bg-beetle-light text-beetle-dark' },
  tesseract: { icon: <Cpu />, className: 'bg-macaw-light text-macaw-dark' },
};

export function EngineStep(props: {
  open: boolean;
  onToggle: () => void;
  engine: Engine;
  setEngine: (e: Engine) => void;
  language: string;
  setLanguage: (l: string) => void;
  autoScan: boolean;
  setAutoScan: (v: boolean) => void;
  keysReady: Record<Engine, boolean>;
}) {
  const lang = LANGUAGES.find((l) => l.code === props.language)?.label ?? props.language;
  const summary = props.keysReady[props.engine] ? (
    `${ENGINES[props.engine].label} · ${lang}${props.autoScan ? ' · automático' : ''}`
  ) : (
    <span className="text-bee-dark">{ENGINES[props.engine].label}: falta la API key</span>
  );

  return (
    <StepCard step={2} title="¿Cómo escanear?" summary={summary} open={props.open} onToggle={props.onToggle}>
      <div className="grid gap-2">
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

      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-swan p-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bee-light text-bee-dark">
          <Zap className="size-5" fill="currentColor" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold">Escaneo automático</span>
          <span className="block text-sm text-wolf">{props.autoScan ? 'Cada foto se escanea al tomarla.' : 'Tomas las fotos y escaneas cuando quieras.'}</span>
        </span>
        <Toggle checked={props.autoScan} onChange={props.setAutoScan} label="Escaneo automático" />
      </label>
    </StepCard>
  );
}
