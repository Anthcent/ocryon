import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { prepareImage, rotateImage } from '../lib/image';
import { loadPages, savePages, type PendingPage } from '../lib/pages-store';
import { tesseractRecognize } from '../lib/tesseract';
import type { Engine } from '../lib/types';

interface ScanSession {
  pages: PendingPage[];
  ready: boolean;
  engine: Engine;
  language: string;
  autoScan: boolean;
  setEngine: (e: Engine) => void;
  setLanguage: (l: string) => void;
  setAutoScan: (v: boolean) => void;
  /** Añade imágenes al final; devuelve los ids creados y cuántas no se pudieron leer. */
  addImages: (files: Blob[]) => Promise<{ ids: string[]; failed: number }>;
  queue: (ids?: string[]) => void;
  updateText: (id: string, text: string) => void;
  remove: (id: string) => void;
  removeMany: (ids: string[]) => void;
  move: (id: string, delta: number) => void;
  /** Gira la imagen 90° a la derecha (útil si la foto salió de lado). */
  rotate: (id: string) => Promise<void>;
}

const ScanSessionContext = createContext<ScanSession | null>(null);

// Errores de configuración: no tiene sentido seguir con la cola hasta que el usuario los corrija.
const BLOCKING_CODES = new Set(['missing_api_key', 'invalid_api_key', 'invalid_model', 'offline', 'unauthenticated']);

/**
 * Sesión de escaneo global: las páginas capturadas y la cola de OCR sobreviven
 * a la navegación entre pantallas y a recargas (se guardan en IndexedDB).
 */
export function ScanSessionProvider({
  children,
  userId,
  defaults,
}: {
  children: ReactNode;
  userId: number;
  defaults: { engine: Engine; language: string; autoScan: boolean };
}) {
  const [pages, setPages] = useState<PendingPage[]>([]);
  const [ready, setReady] = useState(false);
  const [engine, setEngine] = useState<Engine>(defaults.engine);
  const [language, setLanguage] = useState(defaults.language);
  const [autoScan, setAutoScan] = useState(defaults.autoScan);
  const running = useRef(false);

  useEffect(() => {
    setEngine(defaults.engine);
    setLanguage(defaults.language);
    setAutoScan(defaults.autoScan);
  }, [defaults.engine, defaults.language, defaults.autoScan]);

  useEffect(() => {
    loadPages(userId).then((p) => {
      setPages(p);
      setReady(true);
    });
  }, [userId]);

  useEffect(() => {
    if (ready) void savePages(userId, pages);
  }, [pages, ready, userId]);

  const patch = useCallback((id: string, changes: Partial<PendingPage>) => {
    setPages((all) => all.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }, []);

  // Procesa la cola de una página a la vez.
  useEffect(() => {
    if (!ready || running.current) return;
    const next = pages.find((p) => p.status === 'queued');
    if (!next) return;

    running.current = true;
    patch(next.id, { status: 'scanning', error: undefined });

    (async () => {
      try {
        if (engine !== 'tesseract' && !navigator.onLine) {
          throw new ApiError(0, 'Sin conexión: usa Tesseract para escanear sin internet', 'offline');
        }
        const text =
          engine === 'tesseract'
            ? await tesseractRecognize(next.image, language)
            : (await api.ocr(next.image, engine, language)).text;
        patch(next.id, {
          status: 'done',
          text,
          engine,
          error: text ? undefined : 'No se detectó texto en la imagen',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al escanear';
        patch(next.id, { status: 'error', error: message });
        if (err instanceof ApiError && err.code && BLOCKING_CODES.has(err.code)) {
          setPages((all) => all.map((p) => (p.status === 'queued' ? { ...p, status: 'pending' } : p)));
        }
      } finally {
        running.current = false;
        // Fuerza una nueva evaluación de la cola.
        setPages((all) => [...all]);
      }
    })();
  }, [pages, ready, engine, language, patch]);

  const addImages = useCallback(
    async (files: Blob[]) => {
      let failed = 0;
      const ids: string[] = [];
      for (const file of files) {
        let image: Blob;
        try {
          image = await prepareImage(file);
        } catch {
          failed++;
          continue;
        }
        const page: PendingPage = {
          id: crypto.randomUUID(),
          image,
          status: autoScan ? 'queued' : 'pending',
          text: '',
          createdAt: Date.now(),
        };
        ids.push(page.id);
        setPages((all) => [...all, page]);
      }
      return { ids, failed };
    },
    [autoScan],
  );

  const queue = useCallback((ids?: string[]) => {
    setPages((all) =>
      all.map((p) =>
        (ids ? ids.includes(p.id) : p.status === 'pending' || p.status === 'error') && p.status !== 'scanning'
          ? { ...p, status: 'queued', error: undefined }
          : p,
      ),
    );
  }, []);

  const updateText = useCallback((id: string, text: string) => {
    setPages((all) =>
      all.map((p) => (p.id === id ? { ...p, text, status: 'done', error: undefined, engine: p.engine ?? 'manual' } : p)),
    );
  }, []);

  const removeMany = useCallback((ids: string[]) => setPages((all) => all.filter((p) => !ids.includes(p.id))), []);
  const remove = useCallback((id: string) => removeMany([id]), [removeMany]);

  const move = useCallback((id: string, delta: number) => {
    setPages((all) => {
      const from = all.findIndex((p) => p.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= all.length) return all;
      const copy = [...all];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  }, []);

  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const rotate = useCallback(async (id: string) => {
    const page = pagesRef.current.find((p) => p.id === id);
    if (!page || page.status === 'scanning') return;
    const image = await rotateImage(page.image);
    setPages((all) => all.map((p) => (p.id === id ? { ...p, image } : p)));
  }, []);

  return (
    <ScanSessionContext.Provider
      value={{ pages, ready, engine, language, autoScan, setEngine, setLanguage, setAutoScan, addImages, queue, updateText, remove, removeMany, move, rotate }}
    >
      {children}
    </ScanSessionContext.Provider>
  );
}

export function useScanSession() {
  const ctx = useContext(ScanSessionContext);
  if (!ctx) throw new Error('useScanSession fuera de ScanSessionProvider');
  return ctx;
}
