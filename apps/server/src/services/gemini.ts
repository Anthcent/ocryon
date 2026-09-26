import { HttpError } from '../lib/http-error.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

interface GenerateOptions {
  apiKey: string;
  model: string;
  parts: Part[];
  temperature?: number;
  responseSchema?: object;
  timeoutMs?: number;
}

export async function geminiGenerate(opts: GenerateOptions): Promise<string> {
  const generationConfig: Record<string, unknown> = { temperature: opts.temperature ?? 0 };
  if (opts.responseSchema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = opts.responseSchema;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/models/${encodeURIComponent(opts.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: opts.parts }], generationConfig }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
    });
  } catch (err) {
    throw new HttpError(502, 'No se pudo conectar con Gemini', 'provider_unreachable');
  }

  const body = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const message: string = body?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 400 && /api key/i.test(message)) {
      throw new HttpError(400, 'La API key de Gemini no es válida', 'invalid_api_key');
    }
    if (res.status === 403) throw new HttpError(400, 'La API key de Gemini no tiene permiso para este modelo', 'invalid_api_key');
    if (res.status === 404) throw new HttpError(400, `El modelo "${opts.model}" no existe en Gemini`, 'invalid_model');
    if (res.status === 429) throw new HttpError(429, 'Gemini alcanzó el límite de uso, intenta más tarde', 'rate_limited');
    throw new HttpError(502, `Gemini respondió con un error: ${message}`, 'provider_error');
  }

  const candidate = body?.candidates?.[0];
  const text: string = (candidate?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  if (!text && candidate?.finishReason && candidate.finishReason !== 'STOP') {
    throw new HttpError(422, `Gemini no devolvió texto (${candidate.finishReason})`, 'provider_empty');
  }
  return text;
}
