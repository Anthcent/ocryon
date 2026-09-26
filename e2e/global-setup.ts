import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

export const FIXTURES = path.join(__dirname, '.fixtures');

const PAGES = [
  'En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero.',
  'Tenía en su casa una ama que pasaba de los cuarenta, y una sobrina que no llegaba a los veinte, y un mozo de campo y plaza.',
  'Frisaba la edad de nuestro hidalgo con los cincuenta años; era de complexión recia, seco de carnes, enjuto de rostro.',
];

/** Genera "fotos" de páginas de libro y un archivo que no es una imagen válida. */
export default async function globalSetup() {
  fs.mkdirSync(FIXTURES, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  for (const [i, text] of PAGES.entries()) {
    await page.setContent(
      `<body style="margin:0;background:#fdfaf2;font:36px Georgia,serif;padding:80px;line-height:1.6;color:#222"><p>${text}</p></body>`,
    );
    await page.screenshot({ path: path.join(FIXTURES, `pagina-${i + 1}.png`) });
  }
  await browser.close();
  fs.writeFileSync(path.join(FIXTURES, 'no-es-imagen.png'), 'esto no es una imagen');
}
