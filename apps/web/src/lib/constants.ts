import type { Engine, GroupColor } from './types';

export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'spa', label: 'Español' },
  { code: 'eng', label: 'Inglés' },
  { code: 'por', label: 'Portugués' },
  { code: 'fre', label: 'Francés' },
  { code: 'ger', label: 'Alemán' },
  { code: 'ita', label: 'Italiano' },
];

export const ENGINES: Record<Engine, { label: string; description: string; online: boolean }> = {
  ocrspace: { label: 'OCR.space', description: 'Rápido y preciso. Requiere internet y API key.', online: true },
  gemini: { label: 'Gemini', description: 'IA de Google: la mejor calidad en páginas difíciles.', online: true },
  tesseract: { label: 'Tesseract', description: 'Funciona en tu dispositivo, sin enviar la imagen.', online: false },
};

export const ENGINE_LABEL: Record<string, string> = {
  ocrspace: 'OCR.space',
  gemini: 'Gemini',
  tesseract: 'Tesseract',
  manual: 'Manual',
};

/** Clases por color de grupo (escritas completas para que Tailwind las detecte). */
export const GROUP_STYLES: Record<GroupColor, { bg: string; soft: string; text: string; border: string }> = {
  green: { bg: 'bg-feather', soft: 'bg-feather-light', text: 'text-feather-dark', border: 'border-feather-dark' },
  blue: { bg: 'bg-macaw', soft: 'bg-macaw-light', text: 'text-macaw-dark', border: 'border-macaw-dark' },
  purple: { bg: 'bg-beetle', soft: 'bg-beetle-light', text: 'text-beetle-dark', border: 'border-beetle-dark' },
  orange: { bg: 'bg-fox', soft: 'bg-fox-light', text: 'text-fox-dark', border: 'border-fox-dark' },
  red: { bg: 'bg-cardinal', soft: 'bg-cardinal-light', text: 'text-cardinal-dark', border: 'border-cardinal-dark' },
  yellow: { bg: 'bg-bee', soft: 'bg-bee-light', text: 'text-bee-dark', border: 'border-bee-dark' },
};

export const GROUP_COLORS = Object.keys(GROUP_STYLES) as GroupColor[];
