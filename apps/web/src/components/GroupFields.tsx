import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { CATEGORY_PRESETS, categoryEmoji, GROUP_COLORS, GROUP_STYLES } from '../lib/constants';
import type { GroupInput } from '../lib/types';
import { Field, Input, Textarea } from './ui';

export const EMPTY_GROUP: GroupInput = { title: '', description: '', author: '', category: '', color: 'green', totalPages: null };

/**
 * Datos de un libro o grupo: nombre, autor, categoría, páginas totales, color y (opcional) descripción.
 * Se usa al crear un grupo desde el escáner y al editarlo desde el catálogo.
 */
export function GroupFields({
  value,
  onChange,
  withDescription,
  autoFocus,
}: {
  value: GroupInput;
  onChange: (v: GroupInput) => void;
  withDescription?: boolean;
  autoFocus?: boolean;
}) {
  const [custom, setCustom] = useState<string[]>([]);
  const set = <K extends keyof GroupInput>(key: K, v: GroupInput[K]) => onChange({ ...value, [key]: v });

  // Categorías que el usuario ya usó, además de las sugeridas.
  useEffect(() => {
    api.groups
      .categories()
      .then((r) => setCustom(r.categories.map((c) => c.category).filter((c) => !CATEGORY_PRESETS.some((p) => p.name === c))))
      .catch(() => {});
  }, []);

  const categories = [...CATEGORY_PRESETS.map((c) => c.name), ...custom];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Nombre">
          <Input
            value={value.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Ej. Cien años de soledad"
            maxLength={160}
            aria-label="Nombre del grupo"
            autoFocus={autoFocus}
          />
        </Field>
        <Field label="Autor (opcional)">
          <Input value={value.author} onChange={(e) => set('author', e.target.value)} placeholder="Ej. Gabriel García Márquez" maxLength={160} aria-label="Autor" />
        </Field>
      </div>

      <div>
        <div className="mb-2 text-sm font-extrabold">Categoría</div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Categoría">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={value.category === c}
              onClick={() => set('category', value.category === c ? '' : c)}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-2xl border-2 border-b-4 px-3 py-1.5 text-sm font-extrabold transition active:translate-y-[2px] active:border-b-2',
                value.category === c ? 'border-macaw bg-macaw-light text-macaw-dark' : 'border-swan bg-white text-wolf hover:bg-polar',
              )}
            >
              <span aria-hidden>{categoryEmoji(c)}</span>
              {c}
            </button>
          ))}
        </div>
        <Input
          className="mt-2"
          value={categories.includes(value.category) ? '' : value.category}
          onChange={(e) => set('category', e.target.value)}
          placeholder="…u otra categoría"
          maxLength={60}
          aria-label="Otra categoría"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_1fr] md:items-end">
        <Field label="Páginas del libro (opcional)" hint="Para ver cuánto te falta.">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={20000}
            value={value.totalPages ?? ''}
            onChange={(e) => set('totalPages', e.target.value ? Math.max(1, Math.min(20000, Number(e.target.value))) : null)}
            placeholder="Ej. 320"
            aria-label="Páginas del libro"
          />
        </Field>
        <div>
          <div className="mb-2 text-sm font-extrabold">Color</div>
          <div className="flex flex-wrap gap-2">
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={value.color === c}
                onClick={() => set('color', c)}
                className={clsx('size-9 rounded-full', GROUP_STYLES[c].bg, value.color === c && 'ring-4 ring-macaw/40 ring-offset-2')}
              />
            ))}
          </div>
        </div>
      </div>

      {withDescription && (
        <Field label="Descripción (opcional)">
          <Textarea value={value.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={2000} aria-label="Descripción" />
        </Field>
      )}
    </div>
  );
}
