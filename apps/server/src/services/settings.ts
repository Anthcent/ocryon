import type { AppContext } from '../context.js';
import { maskKey } from '../lib/crypto.js';
import { HttpError } from '../lib/http-error.js';

export type Provider = 'ocrspace' | 'gemini';
export type Engine = 'ocrspace' | 'gemini' | 'tesseract';

interface SettingsRow {
  default_engine: Engine;
  ocr_language: string;
  auto_scan: boolean;
  gemini_model: string;
  ocrspace_key_enc: string | null;
  gemini_key_enc: string | null;
}

export async function loadSettingsRow(ctx: AppContext, userId: number): Promise<SettingsRow> {
  await ctx.db.run('INSERT INTO settings (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING', [userId]);
  return (await ctx.db.one<SettingsRow>('SELECT * FROM settings WHERE user_id = ?', [userId]))!;
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
export async function publicSettings(ctx: AppContext, userId: number) {
  const row = await loadSettingsRow(ctx, userId);
  const ocrOnlineKey = await ctx.db.one<{ encrypted_key: string; verified_at: string | null }>(
    "SELECT encrypted_key, verified_at FROM provider_keys WHERE provider = 'ocrspace'",
  );
  const sharedOcrConfigured = Boolean(decryptOrEmpty(ctx, ocrOnlineKey?.encrypted_key ?? null) || ctx.fallbackKeys.ocrspace);
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
    autoScan: row.auto_scan,
    geminiModel: row.gemini_model,
    keys: {
      // Existing personal keys are intentionally ignored: institutional OCR is shared.
      ocrspace: {
        configured: sharedOcrConfigured,
        source: sharedOcrConfigured ? 'server' : 'none',
        verified: sharedOcrConfigured && Boolean(ocrOnlineKey?.verified_at && new Date(ocrOnlineKey.verified_at).getTime() > Date.now() - 24 * 60 * 60 * 1000),
        masked: '',
      },
      gemini: describe('gemini', row.gemini_key_enc),
    },
  };
}

export async function getApiKey(ctx: AppContext, userId: number, provider: Provider): Promise<string> {
  const own = provider === 'ocrspace'
    ? decryptOrEmpty(ctx, (await ctx.db.one<{ encrypted_key: string }>(
      "SELECT encrypted_key FROM provider_keys WHERE provider = 'ocrspace'",
    ))?.encrypted_key ?? null)
    : decryptOrEmpty(ctx, (await loadSettingsRow(ctx, userId)).gemini_key_enc);
  const key = own || ctx.fallbackKeys[provider];
  if (!key) {
    if (provider === 'ocrspace') throw new HttpError(412, 'OCR Online no está configurado. Contacta al administrador.', 'missing_api_key');
    throw new HttpError(412, 'Configura tu API key de Gemini en Ajustes', 'missing_api_key');
  }
  return key;
}
