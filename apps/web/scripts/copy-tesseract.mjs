/**
 * Copia el worker, el núcleo WASM y los idiomas de Tesseract a public/tesseract para
 * servirlos desde nuestro propio dominio: sin CDN externo y listo para funcionar sin conexión.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'tesseract');

const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`));

const LANGUAGES = ['spa', 'eng', 'por', 'fra', 'deu', 'ita'];
const CORE_FILES = ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'];

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const fromStat = fs.statSync(from);
  if (fs.existsSync(to) && fs.statSync(to).size === fromStat.size) return;
  fs.copyFileSync(from, to);
}

copy(path.join(pkgDir('tesseract.js'), 'dist', 'worker.min.js'), path.join(out, 'worker.min.js'));
for (const file of CORE_FILES) copy(path.join(pkgDir('tesseract.js-core'), file), path.join(out, 'core', file));
for (const lang of LANGUAGES) {
  copy(
    path.join(pkgDir(`@tesseract.js-data/${lang}`), '4.0.0_best_int', `${lang}.traineddata.gz`),
    path.join(out, 'lang', `${lang}.traineddata.gz`),
  );
}
console.log('Tesseract copiado a public/tesseract');
