import clsx from 'clsx';
import { ArrowLeft, ArrowRight, BookOpen, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { categoryEmoji, GROUP_STYLES } from '../lib/constants';
import { formatNumber } from '../lib/format';
import { stripPageLabel } from '../lib/page-number';
import type { Group } from '../lib/types';
import { LessonProgress } from './ActionTile';
import { Button } from './ui';

interface BookPage {
  id: number;
  text: string;
  pageLabel?: string;
  wordCount?: number;
}

type Leaf =
  | { kind: 'blank' }
  | { kind: 'cover' }
  | { kind: 'page'; page: BookPage; n: number }
  | { kind: 'end' };

const FLIP_MS = 700;

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/**
 * Lector en modo libro: a doble página en pantallas anchas (una en móvil), con portada,
 * paginación y animación de pasar página en 3D.
 */
export function BookViewer({ group, pages, onClose }: { group: Group; pages: BookPage[]; onClose: () => void }) {
  const spread = useMediaQuery('(min-width: 900px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Hojas del libro. A doble página: [interior de tapa, portada, págs..., fin] con número par de hojas.
  const leaves = useMemo<Leaf[]>(() => {
    const body: Leaf[] = pages.map((page, i) => ({ kind: 'page', page, n: i + 1 }));
    if (!spread) return [{ kind: 'cover' }, ...body, { kind: 'end' }];
    const all: Leaf[] = [{ kind: 'blank' }, { kind: 'cover' }, ...body, { kind: 'end' }];
    if (all.length % 2) all.push({ kind: 'blank' });
    return all;
  }, [pages, spread]);

  const steps = spread ? leaves.length / 2 : leaves.length;
  const [pos, setPos] = useState(0);
  const [flip, setFlip] = useState<null | { dir: 1 | -1; turned: boolean }>(null);
  const touchStart = useRef<number | null>(null);

  // Al cambiar entre una y dos páginas se conserva aproximadamente la posición.
  const lastSpread = useRef(spread);
  useEffect(() => {
    if (lastSpread.current === spread) return;
    lastSpread.current = spread;
    setFlip(null);
    setPos((p) => (spread ? Math.floor((p + 1) / 2) : Math.max(0, p * 2 - 1)));
  }, [spread]);

  const clampedPos = Math.min(pos, steps - 1);
  const leaf = (i: number): Leaf => leaves[i] ?? { kind: 'blank' };

  const go = useCallback(
    (dir: 1 | -1) => {
      if (flip) return;
      const target = clampedPos + dir;
      if (target < 0 || target >= steps) return;
      if (reducedMotion) return setPos(target);
      setFlip({ dir, turned: false });
      // En el siguiente cuadro se aplica el giro para que la transición CSS se ejecute.
      requestAnimationFrame(() => requestAnimationFrame(() => setFlip({ dir, turned: true })));
    },
    [flip, clampedPos, steps, reducedMotion],
  );

  const finishFlip = () => {
    if (!flip) return;
    setPos(clampedPos + flip.dir);
    setFlip(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  // Bloquea el scroll de la página de fondo mientras el libro está abierto.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const style = GROUP_STYLES[group.color];
  const render = (l: Leaf, side: 'left' | 'right' | 'single') => <Paper leaf={l} side={side} group={group} total={pages.length} />;

  // Qué se ve en cada capa según la posición y la animación en curso.
  let content: ReactNode;
  if (spread) {
    const L = (s: number) => leaf(s * 2);
    const R = (s: number) => leaf(s * 2 + 1);
    const p = clampedPos;
    const staticLeft = flip?.dir === -1 ? L(p - 1) : L(p);
    const staticRight = flip?.dir === 1 ? R(p + 1) : R(p);
    content = (
      <div className="relative grid h-full w-full grid-cols-2 [perspective:2200px]">
        <div className="relative">{render(staticLeft, 'left')}</div>
        <div className="relative">{render(staticRight, 'right')}</div>
        {/* Lomo */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-10 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/10 to-transparent" />
        {flip && (
          <FlippingLeaf
            className={flip.dir === 1 ? 'left-1/2 w-1/2 origin-left' : 'left-0 w-1/2 origin-right'}
            from={0}
            to={flip.dir === 1 ? -180 : 180}
            turned={flip.turned}
            front={flip.dir === 1 ? render(R(p), 'right') : render(L(p), 'left')}
            back={flip.dir === 1 ? render(L(p + 1), 'left') : render(R(p - 1), 'right')}
            onDone={finishFlip}
          />
        )}
      </div>
    );
  } else {
    const p = clampedPos;
    content = (
      <div className="relative h-full w-full [perspective:1800px]">
        <div className="absolute inset-0">{render(leaf(flip?.dir === 1 ? p + 1 : p), 'single')}</div>
        {flip && (
          <FlippingLeaf
            className="left-0 w-full origin-left"
            from={flip.dir === 1 ? 0 : -180}
            to={flip.dir === 1 ? -180 : 0}
            turned={flip.turned}
            front={render(leaf(flip.dir === 1 ? p : p - 1), 'single')}
            back={<div className="size-full rounded-2xl bg-[#f3eedf]" />}
            onDone={finishFlip}
          />
        )}
      </div>
    );
  }

  // Página «real» mostrada, para el contador (la portada cuenta como 0).
  const shownPage = spread ? Math.min(pages.length, Math.max(0, clampedPos * 2 - 1)) : Math.min(pages.length, clampedPos);
  const pageLabel = spread
    ? clampedPos === 0
      ? 'Portada'
      : `Páginas ${Math.max(1, clampedPos * 2 - 1)}–${Math.min(pages.length, clampedPos * 2)} de ${pages.length}`
    : clampedPos === 0
      ? 'Portada'
      : clampedPos > pages.length
        ? 'Fin'
        : `Página ${clampedPos} de ${pages.length}`;

  return (
    <div role="dialog" aria-modal="true" aria-label={`Modo libro: ${group.title}`} className="fixed inset-0 z-50 flex flex-col bg-[#2b2b2b]">
      <div className="flex items-center gap-3 px-3 py-3 text-white sm:px-5">
        <button onClick={onClose} aria-label="Cerrar modo libro" className="rounded-full bg-white/15 p-2.5 hover:bg-white/25">
          <X className="size-6" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-black">{group.title}</div>
          <div className="truncate text-sm font-bold text-white/60">{pageLabel}</div>
        </div>
        <span className={clsx('hidden rounded-xl px-3 py-1 text-sm font-extrabold text-white sm:block', style.bg)}>
          <BookOpen className="mr-1 inline size-4" /> Modo libro
        </span>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center px-3 pb-2 sm:px-8"
        onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStart.current === null) return;
          const dx = e.changedTouches[0].clientX - touchStart.current;
          touchStart.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        <div className={clsx('relative h-full max-h-[820px] w-full', spread ? 'max-w-[1180px]' : 'max-w-[560px]')}>{content}</div>
      </div>

      <div className="pb-safe space-y-3 px-3 pb-4 pt-1 sm:px-8">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3">
          <div className="flex-1 [&_span]:text-white/70">
            <LessonProgress value={((clampedPos + 1) / steps) * 100} label={`${shownPage}/${pages.length}`} />
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={steps - 1}
          value={clampedPos}
          onChange={(e) => {
            setFlip(null);
            setPos(Number(e.target.value));
          }}
          aria-label="Ir a la página"
          className="mx-auto block w-full max-w-[1180px] accent-[#58cc02]"
        />
        <div className="mx-auto grid max-w-[1180px] grid-cols-2 gap-3">
          <Button variant="plain" size="lg" icon={<ArrowLeft className="size-5" />} disabled={clampedPos === 0 || !!flip} onClick={() => go(-1)}>
            Anterior
          </Button>
          <Button size="lg" disabled={clampedPos >= steps - 1 || !!flip} onClick={() => go(1)}>
            Siguiente <ArrowRight className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Hoja que gira sobre el lomo; tiene cara delantera y trasera. */
function FlippingLeaf({
  className,
  from,
  to,
  turned,
  front,
  back,
  onDone,
}: {
  className: string;
  from: number;
  to: number;
  turned: boolean;
  front: ReactNode;
  back: ReactNode;
  onDone: () => void;
}) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // Red de seguridad por si el navegador no emite transitionend.
  useEffect(() => {
    if (!turned) return;
    const t = setTimeout(() => doneRef.current(), FLIP_MS + 150);
    return () => clearTimeout(t);
  }, [turned]);

  const faceStyle: CSSProperties = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };
  return (
    <div
      data-testid="flipping-leaf"
      className={clsx('absolute inset-y-0 z-10', className)}
      style={{
        transformStyle: 'preserve-3d',
        transform: `rotateY(${turned ? to : from}deg)`,
        transition: `transform ${FLIP_MS}ms cubic-bezier(0.645, 0.045, 0.355, 1)`,
      }}
      onTransitionEnd={(e) => e.propertyName === 'transform' && onDone()}
    >
      <div className="absolute inset-0" style={faceStyle}>
        {front}
        {/* Sombra que se oscurece al levantar la hoja */}
        <div className={clsx('pointer-events-none absolute inset-0 rounded-2xl bg-black transition-opacity', turned ? 'opacity-20' : 'opacity-0')} style={{ transitionDuration: `${FLIP_MS}ms` }} />
      </div>
      <div className="absolute inset-0" style={{ ...faceStyle, transform: 'rotateY(180deg)' }}>
        {back}
      </div>
    </div>
  );
}

/** Una página de papel: portada, página con texto, página final o en blanco. */
function Paper({ leaf, side, group, total }: { leaf: Leaf; side: 'left' | 'right' | 'single'; group: Group; total: number }) {
  const style = GROUP_STYLES[group.color];
  const rounded = side === 'left' ? 'rounded-l-2xl' : side === 'right' ? 'rounded-r-2xl' : 'rounded-2xl';
  const spineShadow =
    side === 'left'
      ? 'shadow-[inset_-18px_0_24px_-18px_rgba(0,0,0,0.25)]'
      : side === 'right'
        ? 'shadow-[inset_18px_0_24px_-18px_rgba(0,0,0,0.25)]'
        : 'shadow-[inset_14px_0_20px_-18px_rgba(0,0,0,0.25)]';

  if (leaf.kind === 'cover') {
    return (
      <div className={clsx('relative flex size-full flex-col justify-between overflow-hidden p-8 text-white shadow-2xl sm:p-12', rounded, style.bg)}>
        <span className="absolute inset-y-0 left-0 w-4 bg-black/15" />
        <BookOpen className="absolute -bottom-8 -right-8 size-64 text-white/10" />
        <div>
          {group.category && (
            <span className="rounded-xl bg-white/25 px-3 py-1 text-sm font-extrabold">
              {categoryEmoji(group.category)} {group.category}
            </span>
          )}
        </div>
        <div className="relative">
          <h2 className="text-3xl font-black leading-tight sm:text-5xl">{group.title}</h2>
          {group.author && <p className="mt-3 text-lg font-bold text-white/85 sm:text-xl">{group.author}</p>}
          {group.description && <p className="mt-4 line-clamp-4 text-white/80">{group.description}</p>}
        </div>
        <div className="relative text-sm font-extrabold text-white/80">
          {total} {total === 1 ? 'página' : 'páginas'} · Toca «Siguiente» para abrir
        </div>
      </div>
    );
  }

  if (leaf.kind === 'end') {
    return (
      <div className={clsx('flex size-full flex-col items-center justify-center gap-4 bg-[#fffdf6] p-8 text-center', rounded, spineShadow)}>
        <div className={clsx('flex size-20 items-center justify-center rounded-3xl text-white', style.bg)}>
          <BookOpen className="size-10" />
        </div>
        <div className="text-2xl font-black text-eel">¡Fin!</div>
        <p className="max-w-xs text-wolf">Has llegado al final de «{group.title}».</p>
      </div>
    );
  }

  if (leaf.kind === 'blank') {
    return <div className={clsx('size-full bg-[#f3eedf]', rounded, spineShadow)} />;
  }

  const { page, n } = leaf;
  const printed = page.pageLabel || String(n);
  return (
    <div className={clsx('flex size-full flex-col bg-[#fffdf6] shadow-2xl', rounded, spineShadow)}>
      <div className="flex items-center justify-between gap-2 px-6 pt-4 text-[11px] font-extrabold uppercase tracking-wider text-hare sm:px-10 sm:pt-6">
        <span className="truncate">{group.title}</span>
        {page.wordCount !== undefined && <span className="shrink-0">{formatNumber(page.wordCount)} pal.</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 sm:px-10">
        <p className="whitespace-pre-line font-serif text-base leading-relaxed text-eel sm:text-[17px]">
          {stripPageLabel(page.text, page.pageLabel ?? '') || <span className="font-sans text-hare">Página sin texto.</span>}
        </p>
      </div>
      <div className={clsx('px-6 pb-4 font-serif text-sm text-wolf sm:px-10 sm:pb-6', side === 'left' ? 'text-left' : side === 'right' ? 'text-right' : 'text-center')}>
        — {printed} —
      </div>
    </div>
  );
}
