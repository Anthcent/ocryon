import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createScans, expectToast, signUp } from './helpers';

test.describe('Catálogo y manejo de lo escaneado', () => {
  test('crear, editar, filtrar y borrar grupos', async ({ page }) => {
    await signUp(page);
    await page.goto('/catalogo');
    await expect(page.getByText('Aún no tienes grupos')).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo grupo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo grupo' });
    await dialog.getByLabel('Nombre del grupo').fill('Historia de Roma');
    await dialog.getByLabel('Autor').fill('Tito Livio');
    await dialog.getByRole('group', { name: 'Categoría' }).getByRole('button', { name: /Historia/ }).click();
    await dialog.getByLabel('Páginas del libro').fill('250');
    await dialog.getByLabel('Descripción').fill('Apuntes del curso');
    await dialog.getByRole('button', { name: 'Color purple' }).click();
    await dialog.getByRole('button', { name: 'Crear grupo' }).click();
    await expect(page.getByRole('heading', { name: 'Historia de Roma' })).toBeVisible();
    await expect(page.getByText('Apuntes del curso')).toBeVisible();

    await page.getByRole('button', { name: 'Editar grupo' }).click();
    const edit = page.getByRole('dialog', { name: 'Editar grupo' });
    await expect(edit.getByLabel('Nombre del grupo')).toHaveValue('Historia de Roma');
    await expect(edit.getByLabel('Autor')).toHaveValue('Tito Livio');
    await expect(edit.getByRole('group', { name: 'Categoría' }).getByRole('button', { name: /Historia/ })).toHaveAttribute('aria-pressed', 'true');
    await edit.getByLabel('Nombre del grupo').fill('Historia de Roma antigua');
    await edit.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('heading', { name: 'Historia de Roma antigua' })).toBeVisible();
    await expect(page.getByText('Apuntes del curso')).toBeVisible();

    await createScans(page, { newGroup: { title: 'Poesía' }, items: [{ text: 'Verde que te quiero verde', engine: 'manual' }] });
    await page.goto('/catalogo');
    await page.getByLabel('Filtrar', { exact: true }).fill('poesia');
    await expect(page.getByRole('link', { name: 'Poesía', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Historia de Roma antigua', exact: true })).toBeHidden();
    await page.getByLabel('Filtrar', { exact: true }).fill('');

    await page.getByRole('link', { name: 'Historia de Roma antigua', exact: true }).click();
    await page.getByRole('button', { name: 'Borrar grupo' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar todo' }).click();
    await expect(page).toHaveURL(/\/catalogo$/);
    await expectToast(page, 'Grupo borrado');
    await expect(page.getByRole('link', { name: 'Historia de Roma antigua', exact: true })).toBeHidden();
  });

  test('ficha de grupo: reordenar, texto completo, exportar, copiar y borrar páginas', async ({ page }) => {
    await signUp(page);
    const { groupId } = await createScans(page, {
      newGroup: { title: 'Libro de prueba' },
      items: [
        { text: 'Contenido de la primera', engine: 'manual' },
        { text: 'Contenido de la segunda', engine: 'manual' },
        { text: 'Contenido de la tercera', engine: 'manual' },
      ],
    });
    await page.goto(`/catalogo/grupo/${groupId}`);
    await expect(page.locator('a[href^="/escaneo/"]')).toHaveCount(3);

    // Bajar la primera: el nuevo orden persiste al recargar.
    const saved = page.waitForResponse((r) => r.url().includes('/order') && r.status() === 204);
    await page.getByRole('button', { name: 'Mover después' }).first().click();
    await saved;
    await page.reload();
    const titles = page.locator('a[href^="/escaneo/"] .truncate');
    await expect(titles).toHaveText(['Página 2', 'Página 1', 'Página 3']);

    // Modo lectura: página a página, con barra de progreso y botones grandes.
    await page.getByRole('button', { name: 'Leer', exact: true }).click();
    const article = page.locator('article');
    await expect(page.getByText('Página 1 de 3')).toBeVisible();
    await expect(article).toContainText('Contenido de la segunda');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Página 2 de 3')).toBeVisible();
    await expect(article).toContainText('Contenido de la primera');
    await page.getByRole('button', { name: 'Todo seguido' }).click();
    const text = await article.innerText();
    expect(text.indexOf('segunda')).toBeLessThan(text.indexOf('primera'));
    expect(text.indexOf('primera')).toBeLessThan(text.indexOf('tercera'));

    // Exportar como texto: todas las páginas, en el orden del libro.
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    const exportDialog = page.getByRole('dialog', { name: 'Exportar' });
    await exportDialog.getByRole('button', { name: 'Texto', exact: true }).click();
    await exportDialog.getByRole('checkbox', { name: 'Título en cada página' }).uncheck();
    const download = page.waitForEvent('download');
    await exportDialog.getByRole('button', { name: /^Descargar Texto/ }).click();
    const exported = fs.readFileSync((await (await download).path())!, 'utf8');
    expect((await download).suggestedFilename()).toBe('Libro de prueba.txt');
    expect(exported).toContain('Contenido de la segunda\n\nContenido de la primera\n\nContenido de la tercera');

    await page.getByRole('button', { name: 'Copiar' }).click();
    await expectToast(page, 'Texto copiado');
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe('Contenido de la segunda\n\nContenido de la primera\n\nContenido de la tercera');

    await page.getByRole('button', { name: 'Páginas', exact: true }).click();
    await page.getByRole('button', { name: 'Borrar página' }).last().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await expectToast(page, 'Página borrada');
    await expect(titles).toHaveCount(2);
  });

  test('ficha de escaneo: editar, navegar entre páginas, mover de grupo y borrar', async ({ page }) => {
    await signUp(page);
    const book = await createScans(page, {
      newGroup: { title: 'Novela' },
      items: [
        { text: 'Capítulo uno', engine: 'manual' },
        { text: 'Capítulo dos', engine: 'manual' },
      ],
    });
    await createScans(page, { newGroup: { title: 'Otro libro' }, items: [{ text: 'Algo', engine: 'manual' }] });

    await page.goto(`/escaneo/${book.ids[0]}`);
    await expect(page.getByText('1 / 2')).toBeVisible();
    await page.getByRole('button', { name: 'Página siguiente' }).click();
    await expect(page).toHaveURL(new RegExp(`/escaneo/${book.ids[1]}$`));
    await expect(page.getByLabel('Texto escaneado')).toHaveText('Capítulo dos');
    await page.getByRole('button', { name: 'Página anterior' }).click();
    await expect(page.getByLabel('Texto escaneado')).toHaveText('Capítulo uno');

    // Editar título y texto (el texto se lee por defecto; «Editar» abre el editor).
    await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
    const save = page.getByRole('button', { name: 'Guardar', exact: true });
    await expect(save).toBeDisabled();
    await page.getByLabel('Título').fill('Capítulo I');
    await page.getByLabel('Texto escaneado').fill('Érase una vez un texto corregido con cinco palabras más');
    await save.click();
    await expectToast(page, 'Cambios guardados');
    await expect(page.getByText('10 palabras')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Capítulo I' })).toBeVisible();
    await expect(page.getByLabel('Texto escaneado')).toContainText('Érase una vez');

    // Mover a otro grupo y luego dejarlo como individual.
    await page.getByRole('button', { name: 'Mover', exact: true }).first().click();
    await page.getByRole('dialog', { name: 'Mover a…' }).getByRole('button', { name: 'Otro libro' }).click();
    await expectToast(page, 'Movido a «Otro libro»');
    await expect(page.getByRole('main').getByRole('link', { name: 'Otro libro' })).toBeVisible();
    await page.getByRole('button', { name: 'Mover', exact: true }).first().click();
    await page.getByRole('dialog', { name: 'Mover a…' }).getByRole('button', { name: 'Ninguno (individual)' }).click();
    await expectToast(page, 'Ahora es un escaneo individual');

    await page.getByRole('button', { name: 'Borrar', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await expect(page).toHaveURL(/\/catalogo\?vista=individuales$/);
    await expect(page.getByText('Sin escaneos individuales')).toBeVisible();
  });

  test('lista de individuales con paginación', async ({ page }) => {
    await signUp(page);
    await createScans(page, {
      items: Array.from({ length: 35 }, (_, i) => ({ text: `Nota número ${i + 1}`, engine: 'manual' })),
    });
    await page.goto('/catalogo?vista=individuales');
    const items = page.locator('a[href^="/escaneo/"]');
    await expect(items).toHaveCount(30);
    await page.getByRole('button', { name: 'Cargar más' }).click();
    await expect(items).toHaveCount(35);
    await expect(page.getByRole('button', { name: 'Cargar más' })).toBeHidden();
  });
});

test.describe('Búsqueda', () => {
  test('busca sin acentos, por prefijo y resalta coincidencias', async ({ page }) => {
    await signUp(page);
    await createScans(page, {
      newGroup: { title: 'Macondo' },
      items: [{ text: 'El coronel Aureliano Buendía había de recordar aquella tarde remota.', engine: 'manual' }],
    });
    await createScans(page, { items: [{ text: 'Receta: harina, agua y sal.', engine: 'manual' }] });

    await page.goto('/buscar');
    await page.getByLabel('Buscar').fill('buendia');
    await expect(page.locator('mark.hit')).toHaveText('Buendía');
    await expect(page.getByText(/1 resultado en 1 libro/)).toBeVisible();

    await page.getByLabel('Buscar').fill('hari');
    await expect(page.locator('mark.hit')).toHaveText('harina');
    await expect(page.getByRole('heading', { name: 'Escaneos sueltos' })).toBeVisible();

    // Filtros: solo libros / solo sueltos.
    await page.getByRole('button', { name: 'Libros', exact: true }).click();
    await expect(page.getByText('Sin resultados')).toBeVisible();
    await page.getByRole('button', { name: 'Sueltos', exact: true }).click();
    await expect(page.locator('mark.hit')).toHaveText('harina');
    await page.getByRole('button', { name: 'Todo', exact: true }).click();

    await page.getByLabel('Buscar').fill('xilófono');
    await expect(page.getByText('Sin resultados')).toBeVisible();

    await page.getByLabel('Buscar').fill('');
    await expect(page.getByText('Búsquedas recientes')).toBeVisible();
    // La búsqueda anterior queda como reciente y se puede repetir con un toque.
    await page.getByRole('button', { name: 'buendia' }).click();
    await expect(page.locator('mark.hit')).toHaveText('Buendía');

    await page.getByLabel('Buscar').fill('coronel');
    await page.locator('mark.hit').click();
    await expect(page).toHaveURL(/\/escaneo\/\d+$/);
    await expect(page.getByLabel('Texto escaneado')).toContainText('Aureliano');
  });
});

test.describe('Modo libro', () => {
  test('abre el libro, pasa páginas con animación y muestra el número de página impreso', async ({ page }) => {
    await signUp(page);
    const { groupId } = await createScans(page, {
      newGroup: { title: 'El Principito', author: 'Antoine de Saint-Exupéry', category: 'Cuento', totalPages: 10 },
      items: [1, 2, 3].map((n) => ({ text: `Texto de la hoja ${n}\n\n— ${n + 40} —`, engine: 'manual', pageLabel: String(n + 40) })),
    });

    // Desde el catálogo: la tarjeta tiene acceso directo al modo libro.
    await page.goto('/catalogo');
    await expect(page.getByText('3/10')).toBeVisible();
    await page.getByRole('link', { name: 'Leer «El Principito» en modo libro' }).click();
    const book = page.getByRole('dialog', { name: 'Modo libro: El Principito' });
    await expect(book).toBeVisible();
    await expect(book.getByRole('heading', { name: 'El Principito' })).toBeVisible(); // portada
    await expect(book.getByText('Antoine de Saint-Exupéry').first()).toBeVisible();

    // En móvil hay botón «Siguiente»; en escritorio, flechas redondas a los lados del libro.
    await book.getByRole('button', { name: /^(Siguiente|Página siguiente)$/ }).click();
    await expect(book.getByTestId('flipping-leaf')).toBeVisible();
    await expect(book.getByTestId('flipping-leaf')).toHaveCount(0);
    await expect(book.getByText('Texto de la hoja 1')).toBeVisible();
    // El número impreso va al pie y no se repite dentro del texto.
    await expect(book.getByText('— 41 —')).toHaveCount(1);

    await page.keyboard.press('ArrowRight');
    await expect(book.getByTestId('flipping-leaf')).toHaveCount(0);
    await expect(book.getByText(/Texto de la hoja (2|3)/).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(book).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/catalogo/grupo/${groupId}$`));

    // Desde la ficha del grupo; se pasa la página arrastrándola con el dedo o el ratón.
    await page.getByRole('button', { name: 'Abrir en modo libro' }).click();
    const opened = page.getByRole('dialog', { name: 'Modo libro: El Principito' });
    const box = (await opened.getByTestId('book').boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.9, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, y, { steps: 6 });
    await expect(opened.getByTestId('flipping-leaf')).toBeVisible();
    await page.mouse.move(box.x + box.width * 0.2, y, { steps: 6 });
    await page.mouse.up();
    await expect(opened.getByTestId('flipping-leaf')).toHaveCount(0);
    await expect(opened.getByText('Texto de la hoja 1')).toBeVisible();

    // Un arrastre corto se cancela y la página no cambia.
    await page.mouse.move(box.x + box.width * 0.9, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.85, y, { steps: 3 });
    await page.mouse.up();
    await expect(opened.getByTestId('flipping-leaf')).toHaveCount(0);
    await expect(opened.getByText('Texto de la hoja 1')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Abrir en modo libro' }).click();
    await expect(page.getByRole('dialog', { name: 'Modo libro: El Principito' })).toBeVisible();
    await page.getByRole('slider', { name: 'Ir a la página' }).fill('2');
    await expect(page.getByText(/Texto de la hoja (2|3)/).first()).toBeVisible();
  });

  test('pasa hacia adelante y hacia atrás de cualquier forma: dedo, toques, botones seguidos y botón atrás', async ({ page }) => {
    await signUp(page);
    // Páginas largas: el texto se desplaza en vertical dentro de la hoja.
    const long = (n: number) => `Texto de la página ${n}. ` + 'Una línea de texto bastante larga para que la hoja tenga desplazamiento. '.repeat(40);
    const { groupId } = await createScans(page, { newGroup: { title: 'Largo' }, items: [1, 2, 3, 4, 5, 6].map((n) => ({ text: long(n), engine: 'manual' })) });
    await page.goto(`/catalogo/grupo/${groupId}`);
    await page.getByRole('button', { name: 'Abrir en modo libro' }).click();
    const dialog = page.getByRole('dialog', { name: 'Modo libro: Largo' });
    const book = dialog.getByTestId('book');
    const box = (await book.boundingBox())!;
    const y = box.y + box.height / 2;
    const at = (pos: number) => expect(book).toHaveAttribute('data-pos', String(pos));
    const settled = () => expect(dialog.getByTestId('flipping-leaf')).toHaveCount(0);
    const mobile = page.viewportSize()!.width < 900;

    // Deslizar sobre el texto: con el dedo en móvil, con el ratón en escritorio.
    const swipe = async (fromX: number, toX: number) => {
      if (mobile) await touchSwipe(page, box.x + box.width * fromX, box.x + box.width * toX, y);
      else {
        await page.mouse.move(box.x + box.width * fromX, y);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * toX, y, { steps: 10 });
        await page.mouse.up();
      }
      await settled();
    };
    await swipe(0.8, 0.15);
    await at(1);
    await swipe(0.8, 0.15);
    await at(2);
    await swipe(0.2, 0.85); // hacia atrás
    await at(1);
    await swipe(0.2, 0.85);
    await at(0);

    // Toques: lado derecho avanza, lado izquierdo retrocede.
    await page.mouse.click(box.x + box.width * 0.9, y);
    await settled();
    await at(1);
    await page.mouse.click(box.x + box.width * 0.9, y);
    await settled();
    await at(2);
    await page.mouse.click(box.x + box.width * 0.1, y);
    await settled();
    await at(1);

    // Dos toques seguidos en «anterior» retroceden dos veces (el segundo no se pierde).
    await page.keyboard.press('ArrowRight');
    await settled();
    await page.keyboard.press('ArrowRight');
    await settled();
    await at(3);
    const back = dialog.getByRole('button', { name: /^(Anterior|Página anterior)$/ }).locator('visible=true');
    await back.click();
    await back.click();
    await settled();
    await at(1);

    // El botón «atrás» del móvil / navegador cierra el libro sin salir de la ficha.
    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/catalogo/grupo/${groupId}$`));
    await expect(page.getByRole('heading', { name: 'Largo' })).toBeVisible();
  });
});

/** Deslizamiento táctil real (eventos touch del navegador), no del ratón. */
async function touchSwipe(page: Page, fromX: number, toX: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, x: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await send('touchStart', fromX);
  for (let i = 1; i <= 12; i++) {
    await send('touchMove', fromX + ((toX - fromX) * i) / 12);
    await page.waitForTimeout(16);
  }
  await send('touchEnd', toX);
  await cdp.detach();
}
