import clsx from 'clsx';
import { ArrowLeft, ArrowRight, BookOpen, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type React from 'react';
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

const FLIP_MS = 800;

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
  const [flip, setFlip] = useState<Flip | null>(null);
  const [hint, setHint] = useState(true);
  const bookRef = useRef<HTMLDivElement>(null);
  // El avance se guarda también aquí: al soltar, el estado de React puede no haberse actualizado aún.
  const drag = useRef<{ x: number; t: number; dir: 1 | -1 | 0; width: number; progress: number } | null>(null);

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
  const canGo = (dir: 1 | -1) => clampedPos + dir >= 0 && clampedPos + dir < steps;

  /** Termina (o cancela) el giro animando desde el punto actual hasta `target`. */
  const settle = useCallback(
    (f: Flip, target: 0 | 1) => {
      if (reducedMotion) {
        if (target === 1) setPos((p) => p + f.dir);
        return setFlip(null);
      }
      const duration = Math.max(220, FLIP_MS * Math.abs(target - f.progress));
      setFlip({ ...f, progress: target, target, duration });
    },
    [reducedMotion],
  );

  const go = useCallback(
    (dir: 1 | -1) => {
      if (flip || !canGo(dir)) return;
      setHint(false);
      if (reducedMotion) return setPos((p) => p + dir);
      const f: Flip = { dir, progress: 0, target: null, duration: 0 };
      setFlip(f);
      // En el siguiente cuadro se anima hasta el final para que la transición CSS se ejecute.
      requestAnimationFrame(() => requestAnimationFrame(() => settle(f, 1)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flip, clampedPos, steps, reducedMotion, settle],
  );

  // Referencia al giro actual: el final puede llegar por transitionend o por el temporizador de
  // seguridad, y solo debe aplicarse una vez (y fuera de un actualizador de estado).
  const flipRef = useRef(flip);
  flipRef.current = flip;
  const onFlipEnd = useCallback(() => {
    const f = flipRef.current;
    if (!f || f.target === null) return;
    flipRef.current = null;
    if (f.target === 1) setPos((p) => p + f.dir);
    setFlip(null);
  }, []);

  // --- Arrastre con el dedo o el ratón: la hoja sigue al puntero ---
  const onPointerDown = (e: React.PointerEvent) => {
    if (flip?.target !== undefined && flip?.target !== null) return;
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    const rect = bookRef.current?.getBoundingClientRect();
    drag.current = { x: e.clientX, t: performance.now(), dir: 0, width: rect ? (spread ? rect.width / 2 : rect.width) : 400, progress: 0 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (d.dir === 0) {
      if (Math.abs(dx) < 10) return;
      const dir = dx < 0 ? 1 : -1;
      if (!canGo(dir) || flip) {
        drag.current = null;
        return;
      }
      d.dir = dir;
      setHint(false);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    const progress = Math.min(1, Math.max(0, (d.dir === 1 ? -dx : dx) / (d.width * 1.1)));
    d.progress = progress;
    setFlip({ dir: d.dir, progress, target: null, duration: 0 });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (d.dir === 0) {
      // Toque sin arrastre: los bordes de la página también pasan de página.
      const rect = bookRef.current?.getBoundingClientRect();
      if (!rect || Math.abs(dx) > 10) return;
      const x = (e.clientX - rect.left) / rect.width;
      if (x > 0.8) go(1);
      else if (x < 0.2) go(-1);
      return;
    }
    const speed = Math.abs(dx) / Math.max(1, performance.now() - d.t); // px/ms
    const current: Flip = { dir: d.dir, progress: d.progress, target: null, duration: 0 };
    // Pasa si se arrastró más de un tercio, o con un gesto rápido que ya movió la hoja un poco
    // (así un roce accidental no cambia de página).
    const flick = speed > 0.5 && d.progress > 0.15;
    settle(current, d.progress > 0.35 || flick ? 1 : 0);
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
  const progress = flip?.progress ?? 0;

  // Qué se ve en cada capa según la posición y el giro en curso.
  let content: ReactNode;
  if (spread) {
    const L = (s: number) => leaf(s * 2);
    const R = (s: number) => leaf(s * 2 + 1);
    const p = clampedPos;
    const staticLeft = flip?.dir === -1 ? L(p - 1) : L(p);
    const staticRight = flip?.dir === 1 ? R(p + 1) : R(p);
    content = (
      <div className="relative grid h-full w-full grid-cols-2 [perspective:2400px]">
        <div className="relative">
          {render(staticLeft, 'left')}
          {flip?.dir === -1 && <RevealShadow side="left" strength={1 - progress} />}
        </div>
        <div className="relative">
          {render(staticRight, 'right')}
          {flip?.dir === 1 && <RevealShadow side="right" strength={1 - progress} />}
        </div>
        {/* Lomo */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-12 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/15 to-transparent" />
        {flip && (
          <FlippingLeaf
            flip={flip}
            className={flip.dir === 1 ? 'left-1/2 w-1/2 origin-left' : 'left-0 w-1/2 origin-right'}
            from={0}
            to={flip.dir === 1 ? -180 : 180}
            front={flip.dir === 1 ? render(R(p), 'right') : render(L(p), 'left')}
            back={flip.dir === 1 ? render(L(p + 1), 'left') : render(R(p - 1), 'right')}
            onDone={onFlipEnd}
          />
        )}
      </div>
    );
  } else {
    const p = clampedPos;
    content = (
      <div className="relative h-full w-full [perspective:2000px]">
        <div className="absolute inset-0">
          {render(leaf(flip?.dir === 1 ? p + 1 : p), 'single')}
          {flip && <RevealShadow side="single" strength={flip.dir === 1 ? 1 - progress : progress} />}
        </div>
        {flip && (
          <FlippingLeaf
            flip={flip}
            className="left-0 w-full origin-left"
            from={flip.dir === 1 ? 0 : -180}
            to={flip.dir === 1 ? -180 : 0}
            front={render(leaf(flip.dir === 1 ? p : p - 1), 'single')}
            back={<div className="size-full rounded-2xl bg-[#f3eedf]" />}
            onDone={onFlipEnd}
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
      : clampedPos * 2 - 1 > pages.length
        ? 'Fin'
        : `Páginas ${Math.max(1, clampedPos * 2 - 1)}–${Math.min(pages.length, clampedPos * 2)} de ${pages.length}`
    : clampedPos === 0
      ? 'Portada'
      : clampedPos > pages.length
        ? 'Fin'
        : `Página ${clampedPos} de ${pages.length}`;
  const busy = !!flip;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Modo libro: ${group.title}`}
      className="fixed inset-0 z-50 flex flex-col bg-[radial-gradient(ellipse_at_top,#3a3f4b,#1f2229)]"
    >
      <div className="flex items-center gap-3 px-3 py-3 text-white sm:px-5">
        <button onClick={onClose} aria-label="Cerrar modo libro" className="rounded-full bg-white/15 p-2.5 transition hover:bg-white/25">
          <X className="size-6" />
        </button>
        <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-xl text-white', style.bg)}>
          <BookOpen className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-black">{group.title}</div>
          <div className="truncate text-sm font-bold text-white/60">{pageLabel}</div>
        </div>
        <div className="hidden w-72 sm:block [&_span]:text-white/70">
          <LessonProgress value={((clampedPos + 1) / steps) * 100} label={`${shownPage}/${pages.length}`} />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center gap-3 overflow-hidden px-2 pb-2 sm:px-6">
        <RoundArrow label="Página anterior" disabled={clampedPos === 0 || busy} onClick={() => go(-1)}>
          <ArrowLeft className="size-6" />
        </RoundArrow>
        <div
          ref={bookRef}
          data-testid="book"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
            if (flip && flip.target === null) settle(flip, 0);
          }}
          className={clsx('relative h-full max-h-[820px] w-full touch-pan-y select-none', spread ? 'max-w-[1180px]' : 'max-w-[560px]')}
        >
          {content}
        </div>
        <RoundArrow label="Página siguiente" disabled={clampedPos >= steps - 1 || busy} onClick={() => go(1)}>
          <ArrowRight className="size-6" />
        </RoundArrow>
        {hint && steps > 1 && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 animate-pulse rounded-full bg-black/60 px-4 py-2 text-sm font-bold text-white">
            👆 Arrastra la página o toca su borde para pasarla
          </div>
        )}
      </div>

      <div className="pb-safe space-y-3 px-3 pb-4 pt-1 sm:px-8">
        <div className="sm:hidden [&_span]:text-white/70">
          <LessonProgress value={((clampedPos + 1) / steps) * 100} label={`${shownPage}/${pages.length}`} />
        </div>
        <input
          type="range"
          min={0}
          max={steps - 1}
          value={clampedPos}
          onChange={(e) => {
            setFlip(null);
            setHint(false);
            setPos(Number(e.target.value));
          }}
          aria-label="Ir a la página"
          className="mx-auto block w-full max-w-[1180px] accent-[#58cc02]"
        />
        <div className="mx-auto grid max-w-[1180px] grid-cols-2 gap-3 sm:hidden">
          <Button variant="plain" size="lg" icon={<ArrowLeft className="size-5" />} disabled={clampedPos === 0 || busy} onClick={() => go(-1)}>
            Anterior
          </Button>
          <Button size="lg" disabled={clampedPos >= steps - 1 || busy} onClick={() => go(1)}>
            Siguiente <ArrowRight className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface Flip {
  dir: 1 | -1;
  /** 0 = hoja sin girar, 1 = hoja completamente pasada. */
  progress: number;
  /** null mientras se arrastra; 0 o 1 cuando se anima hacia ese final. */
  target: 0 | 1 | null;
  duration: number;
}

function RoundArrow({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="hidden size-14 shrink-0 items-center justify-center rounded-full border-2 border-b-4 border-feather-dark bg-feather text-white shadow-lg transition hover:brightness-110 active:translate-y-[2px] active:border-b-2 disabled:border-white/10 disabled:bg-white/10 disabled:text-white/30 sm:flex"
    >
      {children}
    </button>
  );
}

/** Sombra que la hoja proyecta sobre la página que va quedando a la vista. */
function RevealShadow({ side, strength }: { side: 'left' | 'right' | 'single'; strength: number }) {
  const gradient =
    side === 'left' ? 'bg-gradient-to-l from-black/45 via-black/10 to-transparent' : 'bg-gradient-to-r from-black/45 via-black/10 to-transparent';
  return <div className={clsx('pointer-events-none absolute inset-0 rounded-2xl', gradient)} style={{ opacity: Math.max(0, Math.min(1, strength)) }} />;
}

/** Hoja que gira sobre el lomo; sigue al dedo mientras se arrastra y se anima al soltar. */
function FlippingLeaf({
  flip,
  className,
  from,
  to,
  front,
  back,
  onDone,
}: {
  flip: Flip;
  className: string;
  from: number;
  to: number;
  front: ReactNode;
  back: ReactNode;
  onDone: () => void;
}) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const animating = flip.target !== null;

  // Red de seguridad por si el navegador no emite transitionend.
  useEffect(() => {
    if (!animating) return;
    const t = setTimeout(() => doneRef.current(), flip.duration + 150);
    return () => clearTimeout(t);
  }, [animating, flip.duration, flip.target]);

  const angle = from + (to - from) * flip.progress;
  // La luz cambia con el ángulo: la cara se oscurece al levantarse y la trasera se aclara al caer.
  const lift = Math.sin((Math.abs(angle) * Math.PI) / 180);
  const faceStyle: CSSProperties = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };
  const transition = animating ? `${flip.duration}ms cubic-bezier(0.33, 0.9, 0.3, 1)` : '0ms';

  return (
    <div
      data-testid="flipping-leaf"
      className={clsx('absolute inset-y-0 z-10', className)}
      style={{ transformStyle: 'preserve-3d', transform: `rotateY(${angle}deg)`, transition: `transform ${transition}` }}
      onTransitionEnd={(e) => e.target === e.currentTarget && e.propertyName === 'transform' && onDone()}
    >
      <div className="absolute inset-0" style={faceStyle}>
        {front}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-l from-black/40 to-black/5"
          style={{ opacity: lift * 0.9, transition: `opacity ${transition}` }}
        />
      </div>
      <div className="absolute inset-0" style={{ ...faceStyle, transform: 'rotateY(180deg)' }}>
        {back}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-black/35 to-transparent"
          style={{ opacity: lift * 0.8, transition: `opacity ${transition}` }}
        />
      </div>
      {/* Sombra proyectada por la hoja mientras está levantada */}
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.45)]" style={{ opacity: lift }} />
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
