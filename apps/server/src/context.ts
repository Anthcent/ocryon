import type { Database } from './db/index.js';
import type { Cipher } from './lib/crypto.js';

export interface AppContext {
  db: Database;
  cipher: Cipher;
  jwtSecret: string;
  secureCookies: boolean;
  fallbackKeys: { ocrspace: string; gemini: string };
}
