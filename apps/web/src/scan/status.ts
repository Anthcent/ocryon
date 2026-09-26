import type { PageStatus } from '../lib/pages-store';

export const STATUS: Record<PageStatus, { label: string; pill: string; dot: string }> = {
  pending: { label: 'Sin escanear', pill: 'bg-white text-wolf', dot: 'bg-hare' },
  queued: { label: 'En cola', pill: 'bg-bee text-eel', dot: 'bg-bee' },
  scanning: { label: 'Escaneando', pill: 'bg-macaw text-white', dot: 'bg-macaw' },
  done: { label: 'Listo', pill: 'bg-feather text-white', dot: 'bg-feather' },
  error: { label: 'Error', pill: 'bg-cardinal text-white', dot: 'bg-cardinal' },
};
