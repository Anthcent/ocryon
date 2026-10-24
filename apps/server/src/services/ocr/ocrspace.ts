import { HttpError } from '../../lib/http-error.js';

// Configurable solo para pruebas automáticas con un simulador local.
const ENDPOINT = process.env.OCRSPACE_ENDPOINT ?? 'https://api.ocr.space/parse/image';

export async function ocrSpaceRecognize(image: Buffer, mimeType: string, apiKey: string, language: string) {
  const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(image)], { type: mimeType }), `page.${extension}`);
  form.append('language', language);
  form.append('OCREngine', '2');
  form.append('scale', 'true');
  form.append('detectOrientation', 'true');
  form.append('isOverlayRequired', 'false');

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { apikey: apiKey },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new HttpError(502, 'No se pudo conectar con OCR Online', 'provider_unreachable');
  }

  const body = (await res.json().catch(() => null)) as any;
  if (res.status === 403 || res.status === 401) {
    throw new HttpError(400, 'La clave de OCR Online no es válida', 'invalid_api_key');
  }
  if (!res.ok || !body) {
    const detail = typeof body === 'string' ? body : body?.ErrorMessage;
    throw new HttpError(502, `OCR Online respondió con un error${detail ? `: ${detail}` : ''}`, 'provider_error');
  }
  if (body.IsErroredOnProcessing) {
    const detail = [body.ErrorMessage].flat().filter(Boolean).join(' ');
    if (/invalid.{0,30}(api.?key|apikey)|(?:api.?key|apikey).{0,30}invalid|clave.{0,30}inválid/i.test(detail)) {
      throw new HttpError(400, 'La clave de OCR Online no es válida', 'invalid_api_key');
    }
    if (/quota|rate.?limit|exceeded|límite/i.test(detail)) {
      throw new HttpError(429, 'OCR Online alcanzó el límite de solicitudes', 'provider_limit');
    }
    throw new HttpError(422, `OCR Online no pudo procesar la imagen${detail ? `: ${detail}` : ''}`, 'provider_error');
  }
  const results: any[] = body.ParsedResults ?? [];
  return results.map((r) => r.ParsedText ?? '').join('\n').replace(/\r\n/g, '\n').trim();
}
