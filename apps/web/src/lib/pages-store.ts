import { get, set } from 'idb-keyval';

export type PageStatus = 'pending' | 'queued' | 'scanning' | 'done' | 'error';

/**
 * Página capturada que aún no se guarda. La imagen vive solo en este dispositivo (IndexedDB)
 * hasta que se guarda el texto; al guardar se elimina: en el servidor solo queda el escaneo.
 */
export interface PendingPage {
  id: string;
  image: Blob;
  status: PageStatus;
  text: string;
  error?: string;
  engine?: string;
  createdAt: number;
}

const KEY = 'ocryon:pending-pages';

export async function loadPages(): Promise<PendingPage[]> {
  try {
    const pages = (await get<PendingPage[]>(KEY)) ?? [];
    // Si la app se cerró a mitad de un escaneo, esas páginas vuelven a la cola.
    return pages.map((p) => (p.status === 'scanning' ? { ...p, status: 'queued' } : p));
  } catch {
    return [];
  }
}

export async function savePages(pages: PendingPage[]) {
  try {
    await set(KEY, pages);
  } catch {
    // Sin IndexedDB (modo privado): las páginas solo viven en memoria.
  }
}
