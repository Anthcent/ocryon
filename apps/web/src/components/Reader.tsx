import clsx from 'clsx';
import { ArrowLeft, ArrowRight, BookOpenText, Rows3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LessonProgress } from './ActionTile';
import { Button, Card } from './ui';

interface ReaderPage {
  id: number;
  text: string;
}

/**
 * Modo lectura de un grupo: una página a la vez con barra de progreso arriba y botones grandes
 * abajo (como una lección), o todo el texto seguido.
 */
export function Reader({ pages }: { pages: ReaderPage[] }) {
  const [index, setIndex] = useState(0);
  const [continuous, setContinuous] = useState(false);
  const total = pages.length;
  const page = pages[Math.min(index, total - 1)];

  useEffect(() => {
    if (continuous) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [continuous, total]);

  if (total === 0) return <Card className="p-8 text-center text-wolf">Sin texto todavía.</Card>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          {continuous ? (
            <p className="font-extrabold text-wolf">{total} páginas, todo seguido</p>
          ) : (
            <LessonProgress value={((index + 1) / total) * 100} label={`Página ${index + 1} de ${total}`} />
          )}
        </div>
        <div className="flex rounded-2xl border-2 border-swan p-1">
          {[
            { value: false, label: 'Por página', icon: <BookOpenText className="size-4" /> },
            { value: true, label: 'Todo seguido', icon: <Rows3 className="size-4" /> },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={continuous === o.value}
              onClick={() => setContinuous(o.value)}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold uppercase',
                continuous === o.value ? 'bg-macaw-light text-macaw-dark' : 'text-hare hover:text-wolf',
              )}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="px-5 py-6 sm:px-10 sm:py-10">
        <article className="mx-auto max-w-2xl font-serif text-lg leading-relaxed text-eel sm:text-xl">
          {continuous ? (
            <div className="space-y-10">
              {pages.map((p, i) => (
                <section key={p.id}>
                  <div className="mb-3 font-sans text-xs font-black uppercase tracking-wide text-hare">Página {i + 1}</div>
                  <p className="whitespace-pre-line">{p.text}</p>
                </section>
              ))}
            </div>
          ) : (
            <p className="min-h-[40vh] whitespace-pre-line">{page.text || <span className="font-sans text-hare">Esta página no tiene texto.</span>}</p>
          )}
        </article>
      </Card>

      {!continuous && (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="plain" size="lg" icon={<ArrowLeft className="size-5" />} disabled={index === 0} onClick={() => setIndex(index - 1)}>
            Anterior
          </Button>
          <Button size="lg" disabled={index === total - 1} onClick={() => setIndex(index + 1)}>
            Siguiente <ArrowRight className="size-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
