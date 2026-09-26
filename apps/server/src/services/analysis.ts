import { geminiGenerate } from './gemini.js';

const MAX_CHARS = 400_000;

const schema = {
  type: 'OBJECT',
  properties: {
    resumen: { type: 'STRING' },
    temas: { type: 'ARRAY', items: { type: 'STRING' } },
    ideasClave: { type: 'ARRAY', items: { type: 'STRING' } },
    entidades: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { nombre: { type: 'STRING' }, tipo: { type: 'STRING' } },
        required: ['nombre', 'tipo'],
      },
    },
    vocabulario: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { termino: { type: 'STRING' }, definicion: { type: 'STRING' } },
        required: ['termino', 'definicion'],
      },
    },
    preguntas: { type: 'ARRAY', items: { type: 'STRING' } },
    tono: { type: 'STRING' },
    calidadOcr: { type: 'STRING' },
  },
  required: ['resumen', 'temas', 'ideasClave', 'entidades', 'vocabulario', 'preguntas', 'tono', 'calidadOcr'],
};

export interface OnlineAnalysis {
  resumen: string;
  temas: string[];
  ideasClave: string[];
  entidades: { nombre: string; tipo: string }[];
  vocabulario: { termino: string; definicion: string }[];
  preguntas: string[];
  tono: string;
  calidadOcr: string;
}

export async function analyzeWithGemini(text: string, title: string, apiKey: string, model: string) {
  const truncated = text.length > MAX_CHARS;
  const body = truncated ? text.slice(0, MAX_CHARS) : text;
  const prompt = [
    `Analiza el siguiente texto obtenido por OCR de "${title}". Responde siempre en español.`,
    '- resumen: 1 a 3 párrafos claros.',
    '- temas: los temas principales.',
    '- ideasClave: de 3 a 8 ideas clave.',
    '- entidades: personas, lugares, organizaciones u obras mencionadas, con su tipo.',
    '- vocabulario: hasta 10 términos difíciles o técnicos con una definición breve.',
    '- preguntas: 3 a 5 preguntas de repaso sobre el contenido.',
    '- tono: el tono o género del texto en pocas palabras.',
    '- calidadOcr: una valoración breve de la calidad del OCR y errores evidentes detectados.',
    '',
    '--- TEXTO ---',
    body,
  ].join('\n');

  const raw = await geminiGenerate({ apiKey, model, parts: [{ text: prompt }], temperature: 0.3, responseSchema: schema });
  const parsed = JSON.parse(raw) as OnlineAnalysis;
  return { ...parsed, truncated };
}
