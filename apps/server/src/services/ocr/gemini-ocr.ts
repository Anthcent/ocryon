import { geminiGenerate } from '../gemini.js';
import { LANGUAGES } from '../languages.js';

export async function geminiRecognize(image: Buffer, mimeType: string, apiKey: string, model: string, language: string) {
  const languageName = LANGUAGES[language] ?? 'el idioma del documento';
  const prompt = [
    'Eres un motor de OCR. Transcribe con exactitud todo el texto visible en esta imagen de una página de libro.',
    `El texto está principalmente en ${languageName}.`,
    'Reglas:',
    '- Respeta los párrafos y saltos de línea significativos; une las palabras cortadas con guion al final de línea.',
    '- Si hay varias columnas, transcribe cada columna completa en orden de lectura.',
    '- Ignora números de página, encabezados repetidos y marcas de agua.',
    '- No agregues comentarios, títulos ni formato Markdown. Devuelve solo el texto.',
    '- Si no hay texto legible, devuelve una cadena vacía.',
  ].join('\n');

  const text = await geminiGenerate({
    apiKey,
    model,
    parts: [{ inline_data: { mime_type: mimeType, data: image.toString('base64') } }, { text: prompt }],
  });
  return text.trim();
}
