import type {
  Analysis,
  CustomTemplate,
  DocField,
  SavedDocument,
  Engine,
  Group,
  GroupInput,
  Scan,
  ScanEngine,
  SearchResult,
  Settings,
  Stats,
  User,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Se dispara cuando el servidor responde 401 para que la app vuelva al login. */
export const UNAUTHORIZED_EVENT = 'ocryon:unauthorized';

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Requested-With', 'ocryon');
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Sin conexión con el servidor', 'offline');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, data.error ?? `Error ${res.status}`, data.code);
  }
  return data as T;
}

/** Como `request`, pero con XMLHttpRequest para conocer el avance de la subida (fetch no lo ofrece). */
function uploadWithProgress<T>(path: string, body: FormData, onUpload?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.setRequestHeader('X-Requested-With', 'ocryon');
    xhr.upload.onprogress = (e) => e.lengthComputable && onUpload?.(e.loaded / e.total);
    xhr.upload.onloadend = () => onUpload?.(1);
    xhr.onerror = () => reject(new ApiError(0, 'Sin conexión con el servidor', 'offline'));
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // respuesta vacía o no JSON
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data as T);
      if (xhr.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      reject(new ApiError(xhr.status, (data.error as string) ?? `Error ${xhr.status}`, data.code as string | undefined));
    };
    xhr.send(body);
  });
}

const qs = (params: Record<string, string | number | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

export const api = {
  auth: {
    me: () => request<{ user: User }>('/auth/me'),
    login: (email: string, password: string) => request<{ user: User }>('/auth/login', { method: 'POST', json: { email, password } }),
    register: (name: string, email: string, password: string) =>
      request<{ user: User }>('/auth/register', { method: 'POST', json: { name, email, password } }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<void>('/auth/change-password', { method: 'POST', json: { currentPassword, newPassword } }),
  },
  settings: {
    get: () => request<Settings>('/settings'),
    update: (patch: Partial<Omit<Settings, 'keys'>> & { ocrspaceKey?: string | null; geminiKey?: string | null }) =>
      request<Settings>('/settings', { method: 'PUT', json: patch }),
    test: (provider: 'ocrspace' | 'gemini') => request<{ ok: true; ms: number }>(`/settings/test/${provider}`, { method: 'POST' }),
  },
  /** OCR en el servidor; `onUpload` recibe el avance de la subida de la imagen (0 a 1). */
  ocr: (image: Blob, engine: Exclude<Engine, 'tesseract'>, language: string, onUpload?: (fraction: number) => void) => {
    const form = new FormData();
    form.append('engine', engine);
    form.append('language', language);
    form.append('image', image, `page.${image.type.split('/')[1] ?? 'jpg'}`);
    return uploadWithProgress<{ text: string; ms: number }>('/ocr', form, onUpload);
  },
  groups: {
    list: () => request<{ groups: Group[] }>('/groups'),
    get: (id: number) => request<{ group: Group; scans: Scan[] }>(`/groups/${id}`),
    categories: () => request<{ categories: { category: string; count: number }[] }>('/groups/categories'),
    create: (data: Partial<GroupInput> & { title: string }) => request<{ group: Group }>('/groups', { method: 'POST', json: data }),
    update: (id: number, data: Partial<GroupInput>) =>
      request<{ group: Group }>(`/groups/${id}`, { method: 'PATCH', json: data }),
    reorder: (id: number, scanIds: number[]) => request<void>(`/groups/${id}/order`, { method: 'PUT', json: { scanIds } }),
    remove: (id: number) => request<void>(`/groups/${id}`, { method: 'DELETE' }),
  },
  scans: {
    list: (params: { scope?: 'all' | 'individual'; limit?: number; offset?: number } = {}) =>
      request<{ scans: Scan[]; total: number }>(`/scans${qs(params)}`),
    get: (id: number) => request<{ scan: Scan }>(`/scans/${id}`),
    create: (data: {
      groupId?: number;
      newGroup?: Partial<GroupInput> & { title: string };
      items: { title?: string; text: string; engine: ScanEngine; language: string; pageLabel?: string }[];
    }) => request<{ groupId: number | null; ids: number[] }>('/scans', { method: 'POST', json: data }),
    update: (id: number, data: { title?: string; text?: string; groupId?: number | null }) =>
      request<{ scan: Scan }>(`/scans/${id}`, { method: 'PATCH', json: data }),
    remove: (id: number) => request<void>(`/scans/${id}`, { method: 'DELETE' }),
  },
  documents: {
    list: (params: { template?: string; q?: string } = {}) =>
      request<{ documents: SavedDocument[]; counts: { templateKey: string; count: number }[] }>(`/documents${qs(params)}`),
    get: (id: number) => request<{ document: SavedDocument }>(`/documents/${id}`),
    create: (data: Omit<SavedDocument, 'id' | 'createdAt' | 'updatedAt'>) =>
      request<{ document: SavedDocument }>('/documents', { method: 'POST', json: data }),
    update: (id: number, data: { title?: string; fields?: DocField[] }) =>
      request<{ document: SavedDocument }>(`/documents/${id}`, { method: 'PATCH', json: data }),
    remove: (id: number) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
    extract: (fields: Omit<DocField, 'value'>[], text: string, documentType: string) =>
      request<{ values: Record<string, string> }>('/documents/extract', { method: 'POST', json: { fields, text, documentType } }),
    templates: () => request<{ templates: CustomTemplate[] }>('/documents/templates'),
    createTemplate: (data: { name: string; emoji: string; fields: CustomTemplate['fields'] }) =>
      request<{ template: CustomTemplate }>('/documents/templates', { method: 'POST', json: data }),
    removeTemplate: (id: number) => request<void>(`/documents/templates/${id}`, { method: 'DELETE' }),
  },
  search: (q: string, filters: { groupId?: number; type?: 'all' | 'group' | 'individual'; category?: string; limit?: number } = {}) =>
    request<{ results: SearchResult[]; total: number }>(`/search${qs({ q, ...filters })}`),
  stats: () => request<Stats>(`/stats${qs({ tz: -new Date().getTimezoneOffset() })}`),
  analyses: {
    list: (targetType: 'group' | 'scan', targetId: number) =>
      request<{ analyses: Analysis[] }>(`/analyses${qs({ targetType, targetId })}`),
    online: (targetType: 'group' | 'scan', targetId: number) =>
      request<{ analysis: Analysis }>('/analyses/online', { method: 'POST', json: { targetType, targetId } }),
    saveOffline: (targetType: 'group' | 'scan', targetId: number, content: object) =>
      request<{ analysis: Analysis }>('/analyses/offline', { method: 'POST', json: { targetType, targetId, content } }),
    remove: (id: number) => request<void>(`/analyses/${id}`, { method: 'DELETE' }),
  },
};
