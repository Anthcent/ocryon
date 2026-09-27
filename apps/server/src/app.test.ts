import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from './db/index.js';
import { migrations } from './db/migrations.js';
import { createCipher } from './lib/crypto.js';
import { toFtsQuery } from './routes/search.js';

function setup() {
  const db = openDatabase(':memory:');
  const app = createApp({
    db,
    cipher: createCipher('test-secret-key-123456'),
    jwtSecret: 'test-jwt-secret-123456',
    secureCookies: false,
    fallbackKeys: { ocrspace: '', gemini: '' },
  });
  const agent = request.agent(app);
  const post = (url: string, body?: object) => agent.post(url).set('X-Requested-With', 'ocryon').send(body);
  return { db, app, agent, post };
}

async function registered(email = 'ana@example.com') {
  const s = setup();
  await s.post('/api/auth/register', { name: 'Ana', email, password: 'secreto123' }).expect(201);
  return s;
}

describe('auth', () => {
  it('registra, mantiene la sesión y cierra sesión', async () => {
    const { agent, post } = await registered();
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe('ana@example.com');
    await post('/api/auth/logout').expect(204);
  });

  it('rechaza correo duplicado y credenciales incorrectas', async () => {
    const { post } = await registered();
    await post('/api/auth/register', { name: 'Ana', email: 'ANA@example.com', password: 'secreto123' }).expect(409);
    await post('/api/auth/login', { email: 'ana@example.com', password: 'otra-clave' }).expect(401);
    await post('/api/auth/login', { email: 'ana@example.com', password: 'secreto123' }).expect(200);
  });

  it('exige la cabecera anti-CSRF en peticiones que modifican datos', async () => {
    const { agent } = setup();
    await agent.post('/api/auth/login').send({ email: 'a@b.co', password: 'x' }).expect(403);
  });

  it('protege las rutas privadas', async () => {
    const { agent } = setup();
    await agent.get('/api/groups').expect(401);
  });
});

describe('ajustes', () => {
  it('guarda las API keys cifradas y nunca las devuelve en claro', async () => {
    const { agent, db } = await registered();
    const res = await agent
      .put('/api/settings')
      .set('X-Requested-With', 'ocryon')
      .send({ ocrspaceKey: 'K81234567890ABCD', defaultEngine: 'gemini', autoScan: true })
      .expect(200);
    expect(res.body.keys.ocrspace).toEqual({ configured: true, source: 'user', masked: '••••ABCD' });
    expect(res.body.defaultEngine).toBe('gemini');
    expect(JSON.stringify(res.body)).not.toContain('K81234567890ABCD');
    const row = db.prepare('SELECT ocrspace_key_enc FROM settings').get() as { ocrspace_key_enc: string };
    expect(row.ocrspace_key_enc).not.toContain('K81234567890ABCD');
  });

  it('pide configurar la clave antes de usar OCR', async () => {
    const { agent } = await registered();
    const res = await agent
      .post('/api/ocr')
      .set('X-Requested-With', 'ocryon')
      .field('engine', 'ocrspace')
      .attach('image', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(412);
    expect(res.body.code).toBe('missing_api_key');
  });
});

describe('escaneos, grupos y búsqueda', () => {
  it('guarda un grupo nuevo con páginas en orden y busca sin acentos', async () => {
    const { agent, post } = await registered();
    const saved = await post('/api/scans', {
      newGroup: { title: 'Cien años de soledad' },
      items: [
        { text: 'Muchos años después, frente al pelotón de fusilamiento', engine: 'ocrspace' },
        { text: 'el coronel Aureliano Buendía había de recordar', engine: 'gemini' },
      ],
    }).expect(201);
    expect(saved.body.ids).toHaveLength(2);

    const group = await agent.get(`/api/groups/${saved.body.groupId}`).expect(200);
    expect(group.body.scans.map((s: any) => s.title)).toEqual(['Página 1', 'Página 2']);
    expect(group.body.scans[0].wordCount).toBe(8);

    const search = await agent.get('/api/search').query({ q: 'aureliano buendia' }).expect(200);
    expect(search.body.results).toHaveLength(1);
    expect(search.body.results[0].snippet).toContain('\u0002Aureliano\u0003');

    const list = await agent.get('/api/groups').expect(200);
    expect(list.body.groups[0]).toMatchObject({ scanCount: 2, wordCount: 15 });
  });

  it('la edición parcial de un grupo conserva los campos no enviados', async () => {
    const { agent, post } = await registered();
    const { body } = await post('/api/groups', { title: 'Libro', description: 'Notas', color: 'purple' }).expect(201);
    const res = await agent.patch(`/api/groups/${body.group.id}`).set('X-Requested-With', 'ocryon').send({ title: 'Libro 2' }).expect(200);
    expect(res.body.group).toMatchObject({ title: 'Libro 2', description: 'Notas', color: 'purple' });
  });

  it('login con correo inexistente responde 401 (no 500)', async () => {
    const { post } = setup();
    await post('/api/auth/login', { email: 'nadie@example.com', password: 'loquesea' }).expect(401);
  });

  it('guarda escaneos individuales y actualiza el índice al editar', async () => {
    const { agent, post } = await registered();
    const saved = await post('/api/scans', { items: [{ text: 'Receta de pan casero\nHarina y agua', engine: 'tesseract' }] }).expect(201);
    const id = saved.body.ids[0];
    const individual = await agent.get('/api/scans').query({ scope: 'individual' }).expect(200);
    expect(individual.body.scans[0].title).toBe('Receta de pan casero');

    await agent.patch(`/api/scans/${id}`).set('X-Requested-With', 'ocryon').send({ text: 'Receta de tortillas' }).expect(200);
    expect((await agent.get('/api/search').query({ q: 'harina' })).body.results).toHaveLength(0);
    expect((await agent.get('/api/search').query({ q: 'tortil' })).body.results).toHaveLength(1);
  });

  it('aísla los datos entre usuarios', async () => {
    const a = await registered('a@example.com');
    const saved = await a.post('/api/scans', { items: [{ text: 'secreto de A', engine: 'manual' }] }).expect(201);
    const { app } = a;
    const b = request.agent(app);
    await b.post('/api/auth/register').set('X-Requested-With', 'ocryon').send({ name: 'Bea', email: 'b@example.com', password: 'secreto123' }).expect(201);
    await b.get(`/api/scans/${saved.body.ids[0]}`).expect(404);
    expect((await b.get('/api/search').query({ q: 'secreto' })).body.results).toHaveLength(0);
  });

  it('guarda análisis offline y los borra con su escaneo', async () => {
    const { agent, post, db } = await registered();
    const saved = await post('/api/scans', { items: [{ text: 'Un texto corto para analizar', engine: 'manual' }] }).expect(201);
    const id = saved.body.ids[0];
    await post('/api/analyses/offline', { targetType: 'scan', targetId: id, content: { palabras: 5 } }).expect(201);
    const list = await agent.get('/api/analyses').query({ targetType: 'scan', targetId: id }).expect(200);
    expect(list.body.analyses[0].content).toEqual({ palabras: 5 });
    await agent.delete(`/api/scans/${id}`).set('X-Requested-With', 'ocryon').expect(204);
    expect(db.prepare('SELECT COUNT(*) AS n FROM analyses').get()).toEqual({ n: 0 });
  });
});

describe('grupos con más datos y búsqueda filtrada', () => {
  it('guarda autor, categoría, total de páginas y número de página detectado', async () => {
    const { agent, post } = await registered();
    const saved = await post('/api/scans', {
      newGroup: { title: 'Rayuela', author: 'Julio Cortázar', category: 'Novela', totalPages: 600, color: 'blue' },
      items: [{ text: 'Encontraría a la Maga', engine: 'manual', pageLabel: '15' }],
    }).expect(201);
    const { body } = await agent.get(`/api/groups/${saved.body.groupId}`).expect(200);
    expect(body.group).toMatchObject({ author: 'Julio Cortázar', category: 'Novela', totalPages: 600 });
    expect(body.scans[0].pageLabel).toBe('15');
    const cats = await agent.get('/api/groups/categories').expect(200);
    expect(cats.body.categories).toEqual([{ category: 'Novela', count: 1 }]);
  });

  it('filtra la búsqueda por tipo y categoría', async () => {
    const { agent, post } = await registered();
    await post('/api/scans', { newGroup: { title: 'Libro A', category: 'Historia' }, items: [{ text: 'la batalla de Ayacucho', engine: 'manual' }] });
    await post('/api/scans', { newGroup: { title: 'Libro B', category: 'Novela' }, items: [{ text: 'otra batalla imaginaria', engine: 'manual' }] });
    await post('/api/scans', { items: [{ text: 'apunte sobre una batalla', engine: 'manual' }] });
    const all = await agent.get('/api/search').query({ q: 'batalla' });
    expect(all.body.total).toBe(3);
    expect((await agent.get('/api/search').query({ q: 'batalla', type: 'individual' })).body.total).toBe(1);
    expect((await agent.get('/api/search').query({ q: 'batalla', type: 'group' })).body.total).toBe(2);
    const hist = await agent.get('/api/search').query({ q: 'batalla', category: 'Historia' });
    expect(hist.body.results.map((r: any) => r.groupTitle)).toEqual(['Libro A']);
  });

  it('migra una base de datos de la versión 1 sin perder datos', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ocryon-')), 'v1.db');
    const old = new DatabaseSync(file);
    old.exec(migrations[0]);
    old.exec('PRAGMA user_version = 1');
    old.exec(`INSERT INTO users (email, name, password_hash) VALUES ('a@b.co', 'A', 'x')`);
    old.exec(`INSERT INTO groups (user_id, title) VALUES (1, 'Viejo')`);
    old.close();
    const db = openDatabase(file);
    expect(db.prepare('SELECT title, author, category, total_pages AS totalPages FROM groups').get()).toEqual({
      title: 'Viejo', author: '', category: '', totalPages: null,
    });
    db.close();
  });
});

describe('utilidades', () => {
  it('construye consultas FTS seguras', () => {
    expect(toFtsQuery('hola "mundo" OR x*')).toBe('"hola" "mundo" "OR" "x"*');
    expect(toFtsQuery('  ')).toBe('');
  });

  it('resume la actividad de la semana en la zona horaria del usuario', async () => {
    const { agent, post } = await registered();
    await post('/api/scans', { items: [{ text: 'hoy', engine: 'manual' }] });
    const res = await agent.get('/api/stats').query({ tz: -300 }).expect(200);
    expect(res.body.week).toHaveLength(7);
    expect(res.body.week.at(-1).count).toBe(1);
    expect(res.body).not.toHaveProperty('streak');
  });
});
