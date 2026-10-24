import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase, toPositional, type Database } from './db/index.js';
import { migrations } from './db/migrations.js';
import { createCipher } from './lib/crypto.js';
import { resolveSecret } from './lib/secrets.js';
import { getApiKey } from './services/settings.js';
import { buildSnippet, searchTerms } from './lib/snippet.js';
import { toTsQuery } from './routes/search.js';

// Un único PostgreSQL embebido (PGlite) para todo el archivo: arrancarlo cuesta unos segundos.
let db: Database;
beforeAll(async () => {
  db = await openDatabase({});
}, 60_000);
afterAll(() => db?.close());
beforeEach(async () => {
  await db.run('TRUNCATE users, groups, scans, analyses, doc_templates, documents, settings, provider_keys RESTART IDENTITY CASCADE');
});

function setup(options: { allowRemoteSetup?: boolean; setupToken?: string; fallbackOcrKey?: string } = {}) {
  const context = {
    db,
    cipher: createCipher('test-secret-key-123456'),
    jwtSecret: 'test-jwt-secret-123456',
    setupToken: options.setupToken ?? 'test-setup-token',
    allowRemoteSetup: options.allowRemoteSetup,
    secureCookies: false,
    fallbackKeys: { ocrspace: options.fallbackOcrKey ?? '', gemini: '' },
  };
  const app = createApp(context);
  const agent = request.agent(app);
  const post = (url: string, body?: object) => agent.post(url).set('X-Requested-With', 'ocryon').send(body);
  return { db, app, agent, post, context };
}

async function registered(email = 'ana@example.com') {
  const s = setup();
  await s.post('/api/auth/register', { name: 'Ana', email, password: 'secreto123', room: 'Sala General' }).expect(201);
  await db.run("UPDATE users SET status = 'approved' WHERE email = ?", [email]);
  await s.post('/api/auth/login', { email, password: 'secreto123' }).expect(200);
  return s;
}

describe('auth', () => {
  it('permite configurar Admin públicamente solo con token explícito y HTTPS', async () => {
    const secret = 'a'.repeat(64);
    const disabled = setup({ setupToken: secret });
    const data = { name: 'Admin', email: 'admin@example.com', password: 'secreto123', setupToken: secret };
    const httpsHeaders = { Host: 'library.example.org', Origin: 'https://library.example.org', 'X-Forwarded-Proto': 'https' };
    await disabled.post('/api/auth/setup-admin', data).set(httpsHeaders).expect(403);

    const enabled = setup({ allowRemoteSetup: true, setupToken: secret });
    await enabled.post('/api/auth/setup-admin', data).expect(403);
    await enabled.post('/api/auth/setup-admin', data)
      .set({ ...httpsHeaders, Origin: 'http://library.example.org' }).expect(403);
    await enabled.post('/api/auth/setup-admin', data)
      .set({ ...httpsHeaders, Origin: 'https://other.example.org' }).expect(403);
    await enabled.post('/api/auth/setup-admin', data)
      .set({ Host: httpsHeaders.Host, 'X-Forwarded-Proto': 'https' }).expect(403);
    await enabled.post('/api/auth/setup-admin', { ...data, setupToken: 'b'.repeat(64) })
      .set(httpsHeaders).expect(403);
    const created = await enabled.post('/api/auth/setup-admin', data).set(httpsHeaders).expect(201);
    expect(created.body.user).toMatchObject({ email: data.email, role: 'admin', status: 'approved' });
    await enabled.post('/api/auth/setup-admin', { ...data, email: 'other@example.com' })
      .set(httpsHeaders).expect(409);
  });

  it('solo permite crear una cuenta administradora inicial desde localhost', async () => {
    const { agent, post } = setup();
    await agent.get('/api/auth/setup-status').expect(200, { needsSetup: true });
    await post('/api/auth/setup-admin', { name: 'Admin', email: 'admin@example.com', password: 'secreto123', setupToken: 'test-setup-token' }).expect(403);
    const previous = config.host;
    config.host = '127.0.0.1';
    try {
      await post('/api/auth/setup-admin', { name: 'Admin', email: 'admin@example.com', password: 'secreto123', setupToken: 'wrong' }).expect(403);
      const res = await post('/api/auth/setup-admin', { name: 'Admin', email: 'admin@example.com', password: 'secreto123', setupToken: 'test-setup-token' }).expect(201);
      expect(res.body.user.role).toBe('admin');
      await post('/api/auth/setup-admin', { name: 'Otro', email: 'otro@example.com', password: 'secreto123', setupToken: 'test-setup-token' }).expect(409);
      await agent.get('/api/auth/setup-status').expect(200, { needsSetup: false });
    } finally { config.host = previous; }
  });

  it('mantiene cuentas nuevas pendientes hasta aprobación', async () => {
    const { agent, post } = setup();
    await post('/api/auth/register', { name: 'Ana', email: 'ana@example.com', password: 'secreto123', room: 'Sala Norte' }).expect(201);
    await post('/api/auth/login', { email: 'ana@example.com', password: 'secreto123' }).expect(403);
    await agent.get('/api/groups').expect(401);
  });

  it('admin y operador ven archivo, operador aprueba pero no borra', async () => {
    const personal = await registered();
    const scan = await personal.post('/api/scans', { items: [{ text: 'Lectura de sala', engine: 'manual' }] }).expect(201);
    await personal.agent.get('/api/administration/reports').expect(403);

    const admin = setup();
    await admin.post('/api/auth/register', { name: 'Responsable', email: 'admin@example.com', password: 'secreto123', room: 'Dirección' }).expect(201);
    await db.run("UPDATE users SET role = 'admin', status = 'approved' WHERE email = ?", ['admin@example.com']);
    await admin.post('/api/auth/login', { email: 'admin@example.com', password: 'secreto123' }).expect(200);
    const report = await admin.agent.get('/api/administration/reports').expect(200);
    expect(Number(report.body.totals.pages)).toBe(1);
    const archive = await admin.agent.get('/api/administration/archive').expect(200);
    expect(archive.body.scans[0].text).toBe('Lectura de sala');

    const operator = setup();
    await operator.post('/api/auth/register', { name: 'Operador', email: 'op@example.com', password: 'secreto123', room: 'Dirección' }).expect(201);
    await db.run("UPDATE users SET role = 'operator', status = 'approved' WHERE email = ?", ['op@example.com']);
    await operator.post('/api/auth/login', { email: 'op@example.com', password: 'secreto123' }).expect(200);
    const pending = setup();
    await pending.post('/api/auth/register', { name: 'Nuevo', email: 'new@example.com', password: 'secreto123', room: 'Sala Norte' }).expect(201);
    const person = await db.one<{ id: number }>('SELECT id FROM users WHERE email = ?', ['new@example.com']);
    await operator.agent.patch(`/api/administration/users/${person!.id}/status`).set('X-Requested-With', 'ocryon').send({ status: 'approved' }).expect(200);
    await operator.agent.delete(`/api/administration/scans/${scan.body.ids[0]}`).set('X-Requested-With', 'ocryon').expect(403);
    await admin.agent.delete(`/api/administration/scans/${scan.body.ids[0]}`).set('X-Requested-With', 'ocryon').expect(204);
  }, 15_000);
  it('admin edita ficha y catálogo por usuario; operador consulta sin poder editar', async () => {
    const personal = await registered('luz@example.com');
    const other = await registered('other@example.com');
    const owner = (await db.one<{ id: number }>('SELECT id FROM users WHERE email = ?', ['luz@example.com']))!.id;
    const outsider = (await db.one<{ id: number }>('SELECT id FROM users WHERE email = ?', ['other@example.com']))!.id;
    const group = (await db.one<{ id: number }>(`INSERT INTO groups (user_id, title, author)
      VALUES (?, 'Historia regional', 'Biblioteca') RETURNING id`, [owner]))!.id;
    const first = (await db.one<{ id: number }>(`INSERT INTO scans (user_id, group_id, title, text, engine, position)
      VALUES (?, ?, 'Segunda página', 'Texto dos', 'manual', 2) RETURNING id`, [owner, group]))!.id;
    await db.run(`INSERT INTO scans (user_id, group_id, title, text, engine, position)
      VALUES (?, ?, 'Primera página', 'Texto uno', 'manual', 1)`, [owner, group]);
    await db.run(`INSERT INTO scans (user_id, title, text, engine)
      VALUES (?, 'Nota libre', 'Texto libre', 'manual')`, [owner]);
    const foreign = (await db.one<{ id: number }>(`INSERT INTO scans (user_id, title, text, engine)
      VALUES (?, 'Privado', 'Solo otro usuario', 'manual') RETURNING id`, [outsider]))!.id;
    const doc = (await db.one<{ id: number }>(`INSERT INTO documents (user_id, template_key, template_name, title, fields, text)
      VALUES (?, 'letter', 'Carta', 'Solicitud', '[]', 'Contenido') RETURNING id`, [owner]))!.id;

    const admin = setup();
    await admin.post('/api/auth/register', { name: 'Responsable', email: 'admin@example.com', password: 'secreto123', room: 'Dirección' }).expect(201);
    await db.run("UPDATE users SET role = 'admin', status = 'approved' WHERE email = ?", ['admin@example.com']);
    await admin.post('/api/auth/login', { email: 'admin@example.com', password: 'secreto123' }).expect(200);
    await personal.agent.get(`/api/administration/users/${owner}/catalog`).expect(403);
    const catalog = await admin.agent.get(`/api/administration/users/${owner}/catalog`).expect(200);
    expect(catalog.body.groups).toMatchObject([{ title: 'Historia regional', scanCount: 2 }]);
    expect(catalog.body.scans.map((scan: { title: string }) => scan.title)).toEqual(['Primera página', 'Segunda página', 'Nota libre']);
    expect(catalog.body.scans[0]).not.toHaveProperty('text');
    expect(catalog.body.documents).toMatchObject([{ title: 'Solicitud' }]);
    await db.run(`INSERT INTO scans (user_id, title, text, engine)
      SELECT ?, 'Página extra ' || n, '', 'manual' FROM generate_series(1, 201) AS n`, [owner]);
    const complete = await admin.agent.get(`/api/administration/users/${owner}/catalog`).expect(200);
    expect(complete.body.scans).toHaveLength(204);
    expect((await admin.agent.get(`/api/administration/users/${owner}/scans/${first}`).expect(200)).body.scan.text).toBe('Texto dos');
    expect((await admin.agent.get(`/api/administration/users/${owner}/documents/${doc}`).expect(200)).body.document.text).toBe('Contenido');
    await admin.agent.get(`/api/administration/users/${owner}/scans/${foreign}`).expect(404);
    await admin.agent.get(`/api/administration/users/${outsider}/documents/${doc}`).expect(404);
    await admin.agent.get('/api/administration/users/999999/catalog').expect(404);
    await admin.agent.patch(`/api/administration/users/${owner}/profile`).set('X-Requested-With', 'ocryon')
      .send({ name: 'Luz Editada', email: 'other@example.com', room: 'Sala Central' }).expect(409);
    const changed = await admin.agent.patch(`/api/administration/users/${owner}/profile`).set('X-Requested-With', 'ocryon')
      .send({ name: 'Luz Editada', email: 'luz.nueva@example.com', room: 'Sala Central' }).expect(200);
    expect(changed.body.user).toMatchObject({ name: 'Luz Editada', room: 'Sala Central', email: 'luz.nueva@example.com' });
    const adminId = (await db.one<{ id: number }>('SELECT id FROM users WHERE email = ?', ['admin@example.com']))!.id;
    await admin.agent.patch(`/api/administration/users/${adminId}/profile`).set('X-Requested-With', 'ocryon')
      .send({ name: 'Admin editado', email: 'admin@example.com', room: 'Dirección' }).expect(404);

    const operator = setup();
    await operator.post('/api/auth/register', { name: 'Operador', email: 'op@example.com', password: 'secreto123', room: 'Dirección' }).expect(201);
    await db.run("UPDATE users SET role = 'operator', status = 'approved' WHERE email = ?", ['op@example.com']);
    await operator.post('/api/auth/login', { email: 'op@example.com', password: 'secreto123' }).expect(200);
    await operator.agent.get(`/api/administration/users/${owner}/catalog`).expect(200);
    await operator.agent.patch(`/api/administration/users/${owner}/profile`).set('X-Requested-With', 'ocryon')
      .send({ name: 'Cambio', email: 'luz.nueva@example.com', room: 'Otra sala' }).expect(403);
    await other.agent.get(`/api/administration/users/${owner}/scans/${first}`).expect(403);
  }, 20_000);
  it('registra, mantiene la sesión y cierra sesión', async () => {
    const { agent, post } = await registered();
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe('ana@example.com');
    await post('/api/auth/logout').expect(204);
  });

  it('rechaza correo duplicado y credenciales incorrectas', async () => {
    const { post } = await registered();
    await post('/api/auth/register', { name: 'Ana', email: 'ANA@example.com', password: 'secreto123', room: 'Sala General' }).expect(409);
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
  it('conserva clave opcional de Gemini cifrada y nunca la devuelve en claro', async () => {
    const { agent, db } = await registered();
    const res = await agent
      .put('/api/settings')
      .set('X-Requested-With', 'ocryon')
       .send({ geminiKey: 'K81234567890ABCD', defaultEngine: 'gemini', autoScan: true })
       .expect(200);
    expect(res.body.keys.gemini).toEqual({ configured: true, source: 'user', masked: '••••ABCD' });
    expect(res.body.defaultEngine).toBe('gemini');
    expect(JSON.stringify(res.body)).not.toContain('K81234567890ABCD');
    const row = await db.one<{ gemini_key_enc: string }>('SELECT gemini_key_enc FROM settings');
    expect(row!.gemini_key_enc).not.toContain('K81234567890ABCD');
  });

  it('comparte OCR Online cifrado; solo Admin cambia la clave', async () => {
    const person = await registered('staff@example.com');
    const other = await registered('other@example.com');
    await person.agent.put('/api/settings').set('X-Requested-With', 'ocryon')
      .send({ ocrspaceKey: 'KpersonalNotAllowed' }).expect(403);
    await person.post('/api/settings/test/ocrspace').expect(403);
    const admin = setup();
    await admin.post('/api/auth/register', { name: 'Responsable', email: 'admin@example.com', password: 'secreto123', room: 'Dirección' }).expect(201);
    await db.run("UPDATE users SET role = 'admin', status = 'approved' WHERE email = ?", ['admin@example.com']);
    await admin.post('/api/auth/login', { email: 'admin@example.com', password: 'secreto123' }).expect(200);
    const operator = setup();
    await operator.post('/api/auth/register', { name: 'Operador', email: 'operator@example.com', password: 'secreto123', room: 'Sala Norte' }).expect(201);
    await db.run("UPDATE users SET role = 'operator', status = 'approved' WHERE email = ?", ['operator@example.com']);
    await operator.post('/api/auth/login', { email: 'operator@example.com', password: 'secreto123' }).expect(200);
    await operator.agent.put('/api/administration/ocr-online-key').set('X-Requested-With', 'ocryon')
      .send({ key: 'KoperatorNotAllowed' }).expect(403);
    await admin.agent.put('/api/administration/ocr-online-key').set('X-Requested-With', 'ocryon')
      .send({ key: 'KsharedTestKey123' }).expect(200, { configured: true });
    const row = await db.one<{ encrypted_key: string }>("SELECT encrypted_key FROM provider_keys WHERE provider = 'ocrspace'");
    expect(row!.encrypted_key).not.toContain('KsharedTestKey123');
    for (const member of [person, other, operator, admin]) {
      const result = await member.agent.get('/api/settings').expect(200);
      expect(result.body.keys.ocrspace).toEqual({ configured: true, source: 'server', verified: false, masked: '' });
      expect(JSON.stringify(result.body)).not.toContain('KsharedTestKey123');
    }
    const personId = (await db.one<{ id: number }>('SELECT id FROM users WHERE email = ?', ['staff@example.com']))!.id;
    expect(await getApiKey(person.context, personId, 'ocrspace')).toBe('KsharedTestKey123');
    await admin.agent.put('/api/administration/ocr-online-key').set('X-Requested-With', 'ocryon')
      .send({ key: 'KreplacementKey123' }).expect(200);
    expect(await getApiKey(person.context, personId, 'ocrspace')).toBe('KreplacementKey123');
  }, 15_000);

  it('usa clave de entorno común aunque existan claves antiguas de usuario', async () => {
    const member = await registered();
    const id = (await db.one<{ id: number }>('SELECT id FROM users WHERE email = ?', ['ana@example.com']))!.id;
    await db.run('UPDATE settings SET ocrspace_key_enc = ? WHERE user_id = ?', [member.context.cipher.encrypt('KlegacyUserKey'), id]);
    member.context.fallbackKeys.ocrspace = 'KsharedFromDocker';
    expect((await member.agent.get('/api/settings').expect(200)).body.keys.ocrspace).toMatchObject({ configured: true, source: 'server' });
    expect(await getApiKey(member.context, id, 'ocrspace')).toBe('KsharedFromDocker');
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
    await b.post('/api/auth/register').set('X-Requested-With', 'ocryon').send({ name: 'Bea', email: 'b@example.com', password: 'secreto123', room: 'Sala General' }).expect(201);
    await db.run("UPDATE users SET status = 'approved' WHERE email = ?", ['b@example.com']);
    await b.post('/api/auth/login').set('X-Requested-With', 'ocryon').send({ email: 'b@example.com', password: 'secreto123' }).expect(200);
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
    expect(await db.one('SELECT COUNT(*) AS n FROM analyses')).toEqual({ n: 0 });
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

  it('aplica las migraciones una sola vez y conserva los datos al reabrir', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocryon-pg-'));
    const first = await openDatabase({ dataDir });
    await first.run(`INSERT INTO users (email, name, password_hash) VALUES ('a@b.co', 'A', 'x')`);
    await first.close();
    const again = await openDatabase({ dataDir });
    expect(await again.one('SELECT COUNT(*) AS n FROM schema_migrations')).toEqual({ n: migrations.length });
    expect(await again.one('SELECT email FROM users')).toEqual({ email: 'a@b.co' });
    await again.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }, 60_000);

  it('reordena las páginas de un grupo', async () => {
    const { agent, post } = await registered();
    const saved = await post('/api/scans', {
      newGroup: { title: 'Orden' },
      items: ['uno', 'dos', 'tres'].map((text) => ({ text, engine: 'manual' })),
    }).expect(201);
    const [a, b, c] = saved.body.ids;
    await agent.put(`/api/groups/${saved.body.groupId}/order`).set('X-Requested-With', 'ocryon').send({ scanIds: [c, a, b] }).expect(204);
    const { body } = await agent.get(`/api/groups/${saved.body.groupId}`).expect(200);
    expect(body.scans.map((s: any) => s.text)).toEqual(['tres', 'uno', 'dos']);
  });

  it('busca sin acentos en ambos sentidos y por prefijo, y devuelve fechas ISO', async () => {
    const { agent, post } = await registered();
    await post('/api/scans', { items: [{ text: 'Y vio treinta o cuarenta molinos de viento en la Mancha, dijo García Márquez', engine: 'manual' }] });
    const accented = await agent.get('/api/search').query({ q: 'MÁRQUEZ' }).expect(200);
    expect(accented.body.total).toBe(1);
    const prefix = await agent.get('/api/search').query({ q: 'garcia marq' }).expect(200);
    expect(prefix.body.results[0].snippet).toContain('\u0002García\u0003 \u0002Márquez\u0003');
    expect(prefix.body.results[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect((await agent.get('/api/search').query({ q: 'molinos de nieve' })).body.total).toBe(0);
  });
});

describe('documentos', () => {
  const invoice = {
    templateKey: 'factura',
    templateName: 'Factura',
    title: 'Factura F001-123',
    fields: [
      { key: 'numero', label: 'Número', type: 'id', value: 'F001-123' },
      { key: 'total', label: 'Total', type: 'money', value: '118.00' },
    ],
    text: 'FACTURA F001-123 TOTAL S/ 118.00',
    engine: 'tesseract',
    method: 'rules',
  };

  it('guarda, busca, filtra, edita y borra documentos', async () => {
    const { agent, post } = await registered();
    const created = await post('/api/documents', invoice).expect(201);
    const id = created.body.document.id;
    expect(created.body.document.fields[1]).toMatchObject({ key: 'total', value: '118.00' });
    await post('/api/documents', { ...invoice, templateKey: 'recibo', templateName: 'Recibo', title: 'Recibo luz' }).expect(201);

    const all = await agent.get('/api/documents').expect(200);
    expect(all.body.documents).toHaveLength(2);
    expect(all.body.counts).toEqual(expect.arrayContaining([{ templateKey: 'factura', count: 1 }]));
    expect((await agent.get('/api/documents').query({ template: 'recibo' })).body.documents).toHaveLength(1);
    expect((await agent.get('/api/documents').query({ q: 'F001' })).body.documents).toHaveLength(2);
    expect((await agent.get('/api/documents').query({ q: 'luz' })).body.documents).toHaveLength(1);
    // Sin acentos ni mayúsculas, y con comodines de LIKE tratados como texto.
    await post('/api/documents', { ...invoice, title: 'Factura de María Pérez' }).expect(201);
    expect((await agent.get('/api/documents').query({ q: 'maria PEREZ' })).body.documents).toHaveLength(1);
    expect((await agent.get('/api/documents').query({ q: '100%' })).body.documents).toHaveLength(0);
    await agent.delete(`/api/documents/${(await agent.get('/api/documents').query({ q: 'maria' })).body.documents[0].id}`).set('X-Requested-With', 'ocryon').expect(204);

    const fields = [...invoice.fields];
    fields[1] = { ...fields[1], value: '120.00' };
    const patched = await agent.patch(`/api/documents/${id}`).set('X-Requested-With', 'ocryon').send({ fields }).expect(200);
    expect(patched.body.document.fields[1].value).toBe('120.00');
    await agent.delete(`/api/documents/${id}`).set('X-Requested-With', 'ocryon').expect(204);
    await agent.get(`/api/documents/${id}`).expect(404);
  });

  it('crea tipos de documento propios y rechaza campos repetidos', async () => {
    const { agent, post } = await registered();
    const tpl = { name: 'Orden de compra', emoji: '🧾', fields: [{ key: 'proveedor', label: 'Proveedor', type: 'text' }] };
    const res = await post('/api/documents/templates', tpl).expect(201);
    expect(res.body.template.fields).toEqual(tpl.fields);
    await post('/api/documents/templates', { ...tpl, fields: [tpl.fields[0], tpl.fields[0]] }).expect(400);
    expect((await agent.get('/api/documents/templates')).body.templates).toHaveLength(1);
  });

  it('la extracción con IA pide la API key de Gemini', async () => {
    const { post } = await registered();
    const res = await post('/api/documents/extract', { fields: [{ key: 'total', label: 'Total', type: 'money' }], text: 'TOTAL 10' }).expect(412);
    expect(res.body.code).toBe('missing_api_key');
  });

  it('aísla los documentos entre usuarios', async () => {
    const a = await registered('doc-a@example.com');
    const created = await a.post('/api/documents', invoice);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const { body } = created;
    const b = request.agent(a.app);
    await b.post('/api/auth/register').set('X-Requested-With', 'ocryon').send({ name: 'Beto', email: 'doc-b@example.com', password: 'secreto123', room: 'Sala General' }).expect(201);
    await db.run("UPDATE users SET status = 'approved' WHERE email = ?", ['doc-b@example.com']);
    await b.post('/api/auth/login').set('X-Requested-With', 'ocryon').send({ email: 'doc-b@example.com', password: 'secreto123' }).expect(200);
    await b.get(`/api/documents/${body.document.id}`).expect(404);
    expect((await b.get('/api/documents')).body.documents).toHaveLength(0);
  });
});

describe('utilidades', () => {
  it('construye consultas de texto completo seguras', () => {
    expect(toTsQuery(searchTerms('hola "mundo" | !x* & Ñandú'))).toBe('hola & mundo & x & nandu:*');
    expect(searchTerms('  ')).toEqual([]);
    expect(toPositional('a = ? AND b IN (?, ?)')).toBe('a = $1 AND b IN ($2, $3)');
  });

  it('genera y conserva los secretos que no se configuraron; el del entorno tiene prioridad', async () => {
    const generated = await resolveSecret(db, 'PRUEBA_SECRET', undefined);
    expect(generated).toMatch(/^[0-9a-f]{64}$/);
    expect(await resolveSecret(db, 'PRUEBA_SECRET', undefined)).toBe(generated);
    expect(await resolveSecret(db, 'PRUEBA_SECRET', 'desde-el-entorno-123')).toBe('desde-el-entorno-123');
  });

  it('recorta el fragmento alrededor de la coincidencia', () => {
    const text = `${'palabra '.repeat(40)}el Ingenioso hidalgo ${'final '.repeat(40)}`;
    const snippet = buildSnippet(text, ['ingenioso']);
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('\u0002Ingenioso\u0003 hidalgo');
    expect(snippet.split(' ').length).toBeLessThanOrEqual(23);
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
