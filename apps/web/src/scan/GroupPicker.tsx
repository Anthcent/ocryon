import clsx from 'clsx';
import { Check, FileSearch, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BookCover } from '../components/BookCover';
import { Snippet } from '../components/Snippet';
import { Modal, Segmented, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { categoryEmoji, GROUP_COLORS, GROUP_STYLES } from '../lib/constants';
import { timeAgo } from '../lib/format';
import type { Group, GroupColor } from '../lib/types';

type Sort = 'recientes' | 'nombre' | 'hojas';

const norm = (s: string) =>
  s
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const COLOR_NAME: Record<GroupColor, string> = { green: 'verde', blue: 'azul', purple: 'morado', orange: 'naranja', red: 'rojo', yellow: 'amarillo' };

interface TextHits {
  count: number;
  snippet: string;
}

/**
 * Buscador de grupos para el escáner. Pensado para cuando no recuerdas el nombre:
 * busca por título, autor, categoría o descripción, e incluso por una frase del texto
 * ya escaneado; además filtra por categoría y color, y ordena.
 */
export function GroupPicker({
  open,
  onClose,
  groups,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  groups: Group[];
  selectedId: string;
  onSelect: (id: string | 'new') => void;
}) {
  const [query, setQuery] = useState('');
  const [inText, setInText] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [color, setColor] = useState<GroupColor | null>(null);
  const [sort, setSort] = useState<Sort>('recientes');
  const [textHits, setTextHits] = useState<Map<number, TextHits>>(new Map());
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCategory(null);
    setColor(null);
  }, [open]);

  // Búsqueda dentro del texto de las páginas ya guardadas (en el servidor, con FTS).
  const q = query.trim();
  useEffect(() => {
    if (!open || !inText || q.length < 2) {
      setTextHits(new Map());
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      api
        .search(q, { type: 'group', limit: 200 })
        .then(({ results }) => {
          if (!alive) return;
          const hits = new Map<number, TextHits>();
          for (const r of results) {
            if (r.groupId === null) continue;
            const prev = hits.get(r.groupId);
            hits.set(r.groupId, { count: (prev?.count ?? 0) + 1, snippet: prev?.snippet ?? r.snippet });
          }
          setTextHits(hits);
        })
        .catch(() => alive && setTextHits(new Map()))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, inText, open]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of groups) if (g.category) counts.set(g.category, (counts.get(g.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [groups]);
  const colors = GROUP_COLORS.filter((c) => groups.some((g) => g.color === c));

  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const list = groups
      .filter((g) => (!category || g.category === category) && (!color || g.color === color))
      .map((g) => {
        const where: string[] = [];
        if (words.length) {
          const fields: [string, string][] = [
            ['Título', g.title],
            ['Autor', g.author],
            ['Categoría', g.category],
            ['Descripción', g.description],
          ];
          const all = norm(fields.map((f) => f[1]).join(' '));
          if (words.every((w) => all.includes(w))) {
            for (const [label, value] of fields) if (words.some((w) => norm(value).includes(w))) where.push(label);
          }
        }
        const hits = textHits.get(g.id);
        return { group: g, where, hits, matches: !words.length || where.length > 0 || !!hits };
      })
      .filter((r) => r.matches);

    const byName = (a: Group, b: Group) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    list.sort((a, b) => {
      // Primero lo que coincide en los datos del grupo, luego lo encontrado solo en el texto.
      if (words.length && !!a.where.length !== !!b.where.length) return a.where.length ? -1 : 1;
      if (sort === 'nombre') return byName(a.group, b.group);
      if (sort === 'hojas') return (b.group.scanCount ?? 0) - (a.group.scanCount ?? 0);
      return b.group.updatedAt.localeCompare(a.group.updatedAt);
    });
    return list;
  }, [groups, q, category, color, sort, textHits]);

  const pick = (id: string | 'new') => {
    onSelect(id);
    onClose();
  };

  const filtersActive = !!(q || category || color);

  return (
    <Modal open={open} onClose={onClose} title="Buscar grupo" wide>
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-hare" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Título, autor, categoría o una frase del libro…"
            aria-label="Texto a buscar"
            autoFocus
            className="w-full rounded-2xl border-2 border-swan bg-polar py-3 pl-12 pr-11 text-base font-semibold outline-none transition placeholder:text-hare focus:border-macaw focus:bg-white"
          />
          {searching ? (
            <Spinner className="absolute right-3 top-1/2 size-5 -translate-y-1/2" />
          ) : (
            query && (
              <button type="button" aria-label="Limpiar" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-hare hover:text-eel">
                <X className="size-5" />
              </button>
            )
          )}
        </div>

        <button
          type="button"
          aria-pressed={inText}
          onClick={() => setInText(!inText)}
          className={clsx(
            'flex w-full items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left text-sm font-extrabold transition',
            inText ? 'border-beetle bg-beetle-light/60 text-beetle-dark' : 'border-swan text-wolf hover:bg-polar',
          )}
        >
          <FileSearch className="size-5 shrink-0" />
          <span className="flex-1">Buscar también dentro del texto escaneado</span>
          <span className={clsx('flex size-6 items-center justify-center rounded-lg border-2', inText ? 'border-beetle bg-beetle text-white' : 'border-swan')}>
            {inText && <Check className="size-4" strokeWidth={3} />}
          </span>
        </button>

        {(categories.length > 0 || colors.length > 1) && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar grupos">
            {categories.map(([c, n]) => (
              <FilterChip key={c} selected={category === c} onClick={() => setCategory(category === c ? null : c)}>
                <span aria-hidden>{categoryEmoji(c)}</span> {c} <span className="text-xs opacity-70">{n}</span>
              </FilterChip>
            ))}
            {colors.length > 1 &&
              colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${COLOR_NAME[c]}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(color === c ? null : c)}
                  className={clsx('size-9 shrink-0 rounded-full border-4 transition', GROUP_STYLES[c].bg, color === c ? 'border-eel scale-110' : 'border-white shadow')}
                />
              ))}
          </div>
        )}

        <Segmented<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { value: 'recientes', label: 'Recientes' },
            { value: 'nombre', label: 'A–Z' },
            { value: 'hojas', label: 'Más hojas' },
          ]}
        />

        <div className="flex items-center justify-between text-sm font-extrabold text-wolf">
          <span data-testid="group-picker-count">
            {results.length} de {groups.length} {groups.length === 1 ? 'grupo' : 'grupos'}
          </span>
          {filtersActive && (
            <button
              type="button"
              className="text-macaw hover:underline"
              onClick={() => {
                setQuery('');
                setCategory(null);
                setColor(null);
              }}
            >
              Quitar filtros
            </button>
          )}
        </div>

        <ul className="space-y-2" aria-label="Grupos encontrados">
          {results.map(({ group: g, where, hits }) => {
            const selected = selectedId === String(g.id);
            const style = GROUP_STYLES[g.color];
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => pick(String(g.id))}
                  aria-label={`Elegir ${g.title}`}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-2xl border-2 border-b-4 p-2.5 text-left transition active:translate-y-[2px] active:border-b-2',
                    selected ? 'border-macaw bg-macaw-light/60' : 'border-swan bg-white hover:bg-polar',
                  )}
                >
                  <BookCover group={g} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-black">{g.title}</div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs font-bold text-hare">
                      {g.author && <span className={clsx('font-extrabold', style.text)}>{g.author}</span>}
                      {g.category && (
                        <span>
                          {categoryEmoji(g.category)} {g.category}
                        </span>
                      )}
                      <span>
                        {g.scanCount ?? 0} {g.scanCount === 1 ? 'hoja' : 'hojas'}
                        {g.totalPages ? ` de ${g.totalPages}` : ''}
                      </span>
                      <span>· {timeAgo(g.updatedAt)}</span>
                    </div>
                    {(where.length > 0 || hits) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {where.map((w) => (
                          <span key={w} className="rounded-md bg-feather-light px-1.5 text-[11px] font-extrabold text-feather-dark">
                            {w}
                          </span>
                        ))}
                        {hits && (
                          <span className="rounded-md bg-beetle-light px-1.5 text-[11px] font-extrabold text-beetle-dark">
                            {hits.count} {hits.count === 1 ? 'coincidencia' : 'coincidencias'} en el texto
                          </span>
                        )}
                      </div>
                    )}
                    {hits && (
                      <p className="mt-1 line-clamp-2 font-serif text-xs leading-relaxed text-wolf">
                        <Snippet value={hits.snippet} />
                      </p>
                    )}
                  </div>
                  {selected && <Check className="size-6 shrink-0 text-macaw" strokeWidth={3} />}
                </button>
              </li>
            );
          })}
        </ul>

        {results.length === 0 && (
          <div className="rounded-2xl bg-polar p-5 text-center">
            <div className="text-3xl" aria-hidden>
              🔎
            </div>
            <div className="mt-1 font-black">Ningún grupo coincide</div>
            <p className="text-sm font-bold text-wolf">
              {inText ? 'Prueba con otra palabra o quita algún filtro.' : 'Activa «Buscar también dentro del texto» y escribe una frase que recuerdes.'}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => pick('new')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-feather bg-feather-light/40 py-3 font-extrabold text-feather-dark hover:bg-feather-light"
        >
          <Plus className="size-5" strokeWidth={3} /> Crear un grupo nuevo
        </button>
      </div>
    </Modal>
  );
}

function FilterChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-2xl border-2 border-b-4 px-3 py-1.5 text-sm font-extrabold transition active:translate-y-[2px] active:border-b-2',
        selected ? 'border-macaw bg-macaw-light text-macaw-dark' : 'border-swan bg-white text-wolf hover:bg-polar',
      )}
    >
      {children}
    </button>
  );
}
