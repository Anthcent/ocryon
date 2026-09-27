import { api, ApiError } from './api';
import { tesseractRecognize } from './tesseract';
import type { Engine } from './types';

/**
 * Reconoce el texto de una imagen con el motor elegido, informando del avance (0 a 1).
 * La subida de la imagen tiene progreso real; el procesado en el servidor se estima.
 */
export async function runOcr(image: Blob, engine: Engine, language: string, onProgress: (value: number, label: string) => void): Promise<string> {
  if (engine === 'tesseract') return tesseractRecognize(image, language, onProgress);
  if (!navigator.onLine) throw new ApiError(0, 'Sin conexión: usa Tesseract para escanear sin internet', 'offline');

  let current = 0.02;
  let processing = false;
  const timer = setInterval(() => {
    if (!processing) return;
    current += (0.95 - current) * 0.06;
    onProgress(current, 'Leyendo texto…');
  }, 200);
  try {
    const { text } = await api.ocr(image, engine, language, (fraction) => {
      current = 0.02 + fraction * 0.38;
      onProgress(current, 'Subiendo imagen…');
      if (fraction >= 1) processing = true;
    });
    onProgress(1, 'Listo');
    return text;
  } finally {
    clearInterval(timer);
  }
}
