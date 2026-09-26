import type { AppContext } from '../context.js';
import { maskKey } from '../lib/crypto.js';
import { HttpError } from '../lib/http-error.js';

export type Provider = 'ocrspace' | 'gemini';
export type Engine = 'ocrspace' | 'gemini' | 'tesseract';

interface SettingsRow {
  default_engine: Engine;
  ocr_language: string;
  auto_scan: number;
  gemini_model: string;
  ocrspace_key_enc: string | null;
  gemini_key_enc: string | null;
}

export function loadSettingsRow(ctx: AppContext, userId: number): SettingsRow {
  ctx.db.prepare('INSERT OR IGNORE INTO settings (user_id) VALUES (?)').run(userId);
  return ctx.db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as SettingsRow;
}

function decryptOrEmpty(ctx: AppContext, value: string | null): string {
  if (!value) return '';
  try {
    return ctx.cipher.decrypt(value);
  } catch {
    return '';
  }
}

/** Ajustes en formato seguro para el cliente: nunca incluye las claves en claro. */
export function publicSettings(ctx: AppContext, userId: number) {
  const row = loadSettingsRow(ctx, userId);
  const describe = (provider: Provider, enc: string | null) => {
    const own = decryptOrEmpty(ctx, enc);
    const fallback = ctx.fallbackKeys[provider];
    return {
      configured: Boolean(own || fallback),
      source: own ? 'user' : fallback ? 'server' : 'none',
      masked: own ? maskKey(own) : '',
    };
  };
  return {
    defaultEngine: row.default_engine,
    ocrLanguage: row.ocr_language,
    autoScan: row.auto_scan === 1,
    geminiModel: row.gemini_model,
    keys: {
      ocrspace: describe('ocrspace', row.ocrspace_key_enc),
      gemini: describe('gemini', row.gemini_key_enc),
    },
  };
}

export function getApiKey(ctx: AppContext, userId: number, provider: Provider): string {
  const row = loadSettingsRow(ctx, userId);
  const own = decryptOrEmpty(ctx, provider === 'ocrspace' ? row.ocrspace_key_enc : row.gemini_key_enc);
  const key = own || ctx.fallbackKeys[provider];
  if (!key) {
    const name = provider === 'ocrspace' ? 'OCR.space' : 'Gemini';
    throw new HttpError(412, `Configura tu API key de ${name} en Ajustes`, 'missing_api_key');
  }
  return key;
}
