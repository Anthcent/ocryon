import type { DB } from './db/index.js';
import type { Cipher } from './lib/crypto.js';

export interface AppContext {
  db: DB;
  cipher: Cipher;
  jwtSecret: string;
  secureCookies: boolean;
  fallbackKeys: { ocrspace: string; gemini: string };
}
