import clsx from 'clsx';
import { BookOpen, ChevronRight, Clock, FileText, Layers, Search as SearchIcon, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Mascot } from '../components/Logo';
import { Snippet } from '../components/Snippet';
import { Spinner } from '../components/ui';
import { api } from '../lib/api';
import { categoryEmoji, GROUP_STYLES } from '../lib/constants';
import type { Group, SearchResult } from '../lib/types';

type TypeFilter = 'all' | 'group' | 'individual';
const RECENT_KEY = 'ocryon:recent-searches';

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // sin almacenamiento local: no pasa nada
  }
}

interface BookHits {
  groupId: number;
  title: string;
  author: string;
  category: string;
  color: NonNullable<SearchResult['groupColor']>;
  hits: SearchResult[];
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [type, setType] = useState<TypeFilter>((params.get('tipo') as TypeFilter) || 'all');
  const [category, setCategory] = useState(params.get('categoria') ?? '');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    api.groups.list().then((r) => setGroups(r.groups)).catch(() => {});
  }, []);

  const categories = useMemo(() => [...new Set(groups.map((g) => g.category).filter(Boolean))], [groups]);

  useEffect(() => {
    const q = query.trim();
    const next: Record<string, string> = {};
    if (q) next.q = q;
    if (type !== 'all') next.tipo = type;
    if (category) next.categoria = category;
    setParams(next, { replace: true });
    if (!q) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .search(q, { type, category: category || undefined })
        .then((r) => {
          setResults(r.results);
          setTotal(r.total);
          if (r.total > 0 && q.length >= 3) {
            setRecent((prev) => {
              const list = [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
              saveRecent(list);
              return list;
            });
          }
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, type, category, setParams]);

  // Resultados agrupados por libro, en el orden de relevancia del primer resultado.
  const { books, singles } = useMemo(() => {
    const byBook = new Map<number, BookHits>();
    const singles: SearchResult[] = [];
    for (const r of results ?? []) {
      if (r.groupId === null) {
        singles.push(r);
        continue;
      }
      if (!byBook.has(r.groupId)) {
        byBook.set(r.groupId, {
          groupId: r.groupId,
          title: r.groupTitle ?? '',
          author: r.groupAuthor ?? '',
          category: r.groupCategory ?? '',
          color: r.groupColor ?? 'green',
          hits: [],
        });
      }
      byBook.get(r.groupId)!.hits.push(r);
    }
    return { books: [...byBook.values()], singles };
  }, [results]);

  const clearRecent = () => {
    setRecent([]);
    saveRecent([]);
  };

  return (
    <div className="space-y-5">
      {/* Cabecera de color con el buscador */}
      <div className="relative overflow-hidden rounded-3xl border-b-[6px] border-[#1277a8] bg-gradient-to-br from-macaw via-[#3b8ff0] to-beetle p-5 text-white sm:p-7">
        <Sparkles className="absolute right-6 top-5 size-8 text-white/30" />
        <SearchIcon className="absolute -bottom-10 -right-6 size-44 text-white/10" />
        <div className="relative flex items-center gap-4">
          <Mascot className="hidden size-16 shrink-0 rounded-2xl shadow-lg sm:block" />
          <div>
            <h1 className="text-2xl font-black sm:text-3xl">¿Qué quieres encontrar?</h1>
            <p className="font-semibold text-white/85">Busca cualquier palabra en todos tus libros y escaneos.</p>
          </div>
        </div>
        <div className="relative mt-5">
          <SearchIcon className="absolute left-4 top-1/2 size-6 -translate-y-1/2 text-macaw" />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Escribe una palabra o frase…"
            autoFocus
            aria-label="Buscar"
            className="w-full rounded-2xl border-2 border-b-[5px] border-white bg-white py-4 pl-14 pr-12 text-lg font-bold text-eel placeholder:text-hare outline-none focus:border-bee"
          />
          {loading ? (
            <Spinner className="absolute right-4 top-1/2 size-6 -translate-y-1/2" />
          ) : (
            query && (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-hare hover:bg-polar hover:text-wolf"
              >
                <X className="size-5" />
              </button>
            )
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <FilterChip selected={type === 'all'} onClick={() => setType('all')} icon={<Layers className="size-4" />} tone="blue">
          Todo
        </FilterChip>
        <FilterChip selected={type === 'group'} onClick={() => setType('group')} icon={<BookOpen className="size-4" />} tone="green">
          Libros
        </FilterChip>
        <FilterChip selected={type === 'individual'} onClick={() => setType('individual')} icon={<FileText className="size-4" />} tone="purple">
          Sueltos
        </FilterChip>
        {categories.length > 0 && <span className="mx-1 w-0.5 shrink-0 rounded bg-swan" />}
        {categories.map((c) => (
          <FilterChip key={c} selected={category === c} onClick={() => setCategory(category === c ? '' : c)} icon={<span aria-hidden>{categoryEmoji(c)}</span>} tone="orange">
            {c}
          </FilterChip>
        ))}
      </div>

      {results === null ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-3xl border-2 border-swan p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-black">
                <Clock className="size-5 text-fox" /> Búsquedas recientes
              </h2>
              {recent.length > 0 && (
                <button onClick={clearRecent} className="text-xs font-extrabold uppercase text-hare hover:text-wolf">
                  Borrar
                </button>
              )}
            </div>
            {recent.length === 0 ? (
              <p className="text-sm text-wolf">Aquí aparecerán tus últimas búsquedas. La búsqueda ignora mayúsculas y acentos y encuentra palabras incompletas.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button
                    key={r}
                    onClick={() => setQuery(r)}
                    className="rounded-2xl border-2 border-b-4 border-fox/40 bg-fox-light px-3 py-1.5 text-sm font-extrabold text-fox-dark transition active:translate-y-[2px] active:border-b-2"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-3xl border-2 border-swan p-5">
            <h2 className="mb-3 flex items-center gap-2 font-black">
              <BookOpen className="size-5 text-feather" /> Tus libros
            </h2>
            {groups.length === 0 ? (
              <p className="text-sm text-wolf">Cuando guardes libros aparecerán aquí.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {groups.slice(0, 6).map((g) => (
                  <Link
                    key={g.id}
                    to={`/catalogo/grupo/${g.id}`}
                    className={clsx('truncate rounded-2xl border-b-4 px-3 py-2.5 text-sm font-extrabold text-white', GROUP_STYLES[g.color].bg, GROUP_STYLES[g.color].border)}
                  >
                    {g.title}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : results.length === 0 && !loading ? (
        <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-swan px-6 py-12 text-center">
          <Mascot className="mb-4 size-20 opacity-60 grayscale" />
          <h3 className="text-xl font-black">Sin resultados</h3>
          <p className="mt-2 max-w-sm text-wolf">
            No encontramos «{query}»{type !== 'all' || category ? ' con esos filtros' : ''}. Prueba con otra palabra o quita los filtros.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="font-extrabold text-wolf">
            <span className="text-eel">{total}</span> {total === 1 ? 'resultado' : 'resultados'}
            {books.length > 0 && (
              <>
                {' '}en <span className="text-eel">{books.length}</span> {books.length === 1 ? 'libro' : 'libros'}
              </>
            )}
            {singles.length > 0 && (
              <>
                {books.length > 0 ? ' y ' : ' en '}
                <span className="text-eel">{singles.length}</span> {singles.length === 1 ? 'escaneo suelto' : 'escaneos sueltos'}
              </>
            )}
            {total > (results?.length ?? 0) && <span className="text-hare"> (mostrando {results?.length})</span>}
          </p>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {books.map((b) => (
              <BookResults key={b.groupId} book={b} />
            ))}
          </div>

          {singles.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
                <span className="flex size-8 items-center justify-center rounded-xl bg-beetle-light text-beetle-dark">
                  <FileText className="size-5" />
                </span>
                Escaneos sueltos
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {singles.map((r) => (
                  <Link
                    key={r.id}
                    to={`/escaneo/${r.id}`}
                    className="block min-w-0 rounded-2xl border-2 border-b-4 border-beetle/40 bg-white p-4 transition hover:bg-beetle-light/40 active:translate-y-[2px] active:border-b-2"
                  >
                    <div className="mb-1 truncate font-extrabold text-beetle-dark">{r.title}</div>
                    <p className="line-clamp-3 text-sm leading-relaxed text-wolf">
                      <Snippet value={r.snippet} />
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function BookResults({ book }: { book: BookHits }) {
  const style = GROUP_STYLES[book.color];
  return (
    <section className={clsx('min-w-0 overflow-hidden rounded-3xl border-2 border-b-[6px] bg-white', style.border)}>
      <Link to={`/catalogo/grupo/${book.groupId}`} className={clsx('flex items-center gap-3 p-4 text-white', style.bg)}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/25">
          <BookOpen className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-black leading-tight">{book.title}</span>
          <span className="block truncate text-sm font-bold text-white/85">
            {[book.author, book.category && `${categoryEmoji(book.category)} ${book.category}`].filter(Boolean).join(' · ') || 'Libro'}
          </span>
        </span>
        <span className="shrink-0 rounded-xl bg-white px-2.5 py-1 text-sm font-black text-eel">
          {book.hits.length} {book.hits.length === 1 ? 'coincidencia' : 'coincidencias'}
        </span>
      </Link>
      <ul className="divide-y-2 divide-swan">
        {book.hits.map((r) => (
          <li key={r.id}>
            <Link to={`/escaneo/${r.id}`} className="flex gap-3 p-4 transition hover:bg-polar">
              <span className={clsx('flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-xl leading-none', style.soft, style.text)}>
                <span className="text-[10px] font-extrabold uppercase">pág.</span>
                <span className="text-base font-black">{r.pageLabel || r.position + 1}</span>
              </span>
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-wolf">
                <Snippet value={r.snippet} />
              </p>
              <ChevronRight className="mt-3 size-5 shrink-0 text-hare" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const CHIP_TONES = {
  blue: 'border-macaw bg-macaw text-white',
  green: 'border-feather-dark bg-feather text-white',
  purple: 'border-beetle-dark bg-beetle text-white',
  orange: 'border-fox-dark bg-fox text-white',
};

function FilterChip({
  selected,
  onClick,
  icon,
  tone,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  tone: keyof typeof CHIP_TONES;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-2xl border-2 border-b-4 px-3.5 py-2 text-sm font-extrabold transition active:translate-y-[2px] active:border-b-2',
        selected ? CHIP_TONES[tone] : 'border-swan bg-white text-wolf hover:bg-polar',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
