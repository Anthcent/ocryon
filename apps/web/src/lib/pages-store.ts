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

// Una clave por usuario: en un dispositivo compartido nadie ve las fotos pendientes de otro.
const keyFor = (userId: number) => `ocryon:pending-pages:${userId}`;

export async function loadPages(userId: number): Promise<PendingPage[]> {
  try {
    const pages = (await get<PendingPage[]>(keyFor(userId))) ?? [];
    // Si la app se cerró a mitad de un escaneo, esas páginas vuelven a la cola.
    return pages.map((p) => (p.status === 'scanning' ? { ...p, status: 'queued' } : p));
  } catch {
    return [];
  }
}

export async function savePages(userId: number, pages: PendingPage[]) {
  try {
    await set(keyFor(userId), pages);
  } catch {
    // Sin IndexedDB (modo privado): las páginas solo viven en memoria.
  }
}
