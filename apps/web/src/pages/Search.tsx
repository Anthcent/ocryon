import clsx from 'clsx';
import { BookOpen, FileText, Search as SearchIcon } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Card, EmptyState, Input, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { GROUP_STYLES } from '../lib/constants';
import type { SearchResult } from '../lib/types';

/** El servidor marca las coincidencias con \u0002…\u0003; se convierten en <mark> sin usar HTML crudo. */
function Snippet({ value }: { value: string }) {
  const parts = value.split(/(\u0002[^\u0003]*\u0003)/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('\u0002') ? (
          <mark key={i} className="hit">
            {part.slice(1, -1)}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    setParams(q ? { q } : {}, { replace: true });
    if (!q) {
      setResults(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .search(q)
        .then((r) => setResults(r.results))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, setParams]);

  return (
    <div>
      <PageHeader title="Buscar" subtitle="Encuentra cualquier palabra en todo lo que has escaneado." />
      <div className="relative mb-6">
        <SearchIcon className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-hare" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Escribe una palabra o frase…"
          className="pl-12 text-lg"
          autoFocus
          aria-label="Buscar"
        />
        {loading && <Spinner className="absolute right-4 top-1/2 size-5 -translate-y-1/2" />}
      </div>

      {results === null ? (
        <EmptyState icon={<SearchIcon className="size-10" />} title="Busca en tus escaneos">
          La búsqueda ignora mayúsculas y acentos, y encuentra palabras incompletas mientras escribes.
        </EmptyState>
      ) : results.length === 0 && !loading ? (
        <EmptyState icon={<SearchIcon className="size-10" />} title="Sin resultados">
          No encontramos «{query}». Prueba con otra palabra.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-bold text-wolf">
            {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
          </p>
          {results.map((r) => {
            const style = r.groupColor ? GROUP_STYLES[r.groupColor] : null;
            return (
              <Link key={r.id} to={`/escaneo/${r.id}`} className="block">
                <Card interactive className="p-4">
                  <div className="mb-1 flex items-center gap-2 text-sm font-extrabold">
                    {r.groupTitle ? (
                      <span className={clsx('inline-flex items-center gap-1', style?.text)}>
                        <BookOpen className="size-4" /> {r.groupTitle}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-beetle-dark">
                        <FileText className="size-4" /> Individual
                      </span>
                    )}
                    <span className="text-hare">·</span>
                    <span className="truncate">{r.title}</span>
                  </div>
                  <p className="text-wolf">
                    <Snippet value={r.snippet} />
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
