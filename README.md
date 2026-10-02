# Ocryon

Sistema para **escanear libros y documentos** con la cámara del móvil o del PC y convertirlos en texto buscable, usando OCR (OCR.space, Gemini o Tesseract) y con un análisis final del contenido.

## Funcionalidades (v0.1)

| Módulo | Qué hace |
| --- | --- |
| **Escáner** | Pasos guiados (dónde guardar y cómo escanear), cámara en ráfaga con tira de fotos numeradas, subida múltiple o arrastrando, galería numerada para quitar y reordenar, visor a pantalla completa (girar, reescanear, corregir texto). Buscador de grupos por título, autor, categoría, descripción o una frase del texto ya escaneado, con filtros y orden. |
| **Motores OCR** | **OCR.space** y **Gemini** (vía servidor, con la API key del usuario) y **Tesseract** (en el propio dispositivo, sin internet). |
| **Modo de escaneo** | Automático (escanea al tomar la foto) o manual (acumula fotos y escaneas cuando quieras). Por página o todas a la vez. |
| **Catálogo** | **Grupos** (libros con autor, categoría y páginas totales) y **escaneos individuales**. Solo se guarda el texto, nunca la imagen. **Modo libro** a doble página con animación de pasar página. Se detecta el número de página impreso en cada hoja. |
| **Documentos** | Escanea facturas, boletas, DNI, contratos, cartas o tipos propios con sus campos: los datos se detectan y llenan un formulario (con IA de Gemini o con reglas en el dispositivo, sin internet). Se revisan, se editan, se buscan por cualquier dato y se exportan a CSV/JSON. |
| **Búsqueda** | Texto completo (PostgreSQL `tsvector`) sin distinguir acentos ni mayúsculas, con resaltado, filtros (libros, sueltos, categoría), resultados agrupados por libro y búsquedas recientes. |
| **Análisis** | *Rápido (offline)*: estadísticas, legibilidad Fernández Huerta, palabras clave y frases principales. *Con IA (Gemini)*: resumen, temas, ideas clave, entidades, vocabulario y preguntas de repaso. |
| **Ajustes** | API keys cifradas (AES-256-GCM), prueba de conexión, motor/idioma predeterminado, modelo de Gemini, cambio de contraseña. |
| **Seguridad** | Contraseñas con bcrypt, sesión JWT en cookie `httpOnly` + `SameSite=Lax`, protección CSRF por cabecera, rate limiting, CSP con Helmet, aislamiento de datos por usuario. |

## Stack

- **Frontend** (`apps/web`): React 19 + TypeScript + Vite + Tailwind CSS 4. Diseño *mobile-first* estilo Duolingo. Tesseract.js se sirve desde la propia app (sin CDN), listo para el modo offline.
- **Backend** (`apps/server`): Node.js + Express 5 + TypeScript, **PostgreSQL** (búsqueda de texto completo con `tsvector`, sin distinguir acentos), validación con Zod. En desarrollo y pruebas se usa **PGlite** (el mismo PostgreSQL embebido en Node), así que no hay que instalar ninguna base de datos.
- Monorepo con *npm workspaces*. En producción un único proceso sirve la API y el frontend.

```
apps/
  server/src/
    routes/      auth, settings, ocr, groups, scans, search, stats, analyses
    services/    ocr/ (ocrspace, gemini), gemini, analysis, settings
    db/          conexión y migraciones (PRAGMA user_version)
  web/src/
    pages/       Home, Scanner, Catalog, GroupDetail, ScanDetail, Search, Settings, Auth
    scan/        sesión de escaneo (cola OCR + IndexedDB), cámara, tarjetas de página
    lib/         cliente API, compresión de imagen, Tesseract, análisis offline
```

## Puesta en marcha

Requisitos: Node.js 22.13 o superior. No hace falta instalar PostgreSQL: sin `DATABASE_URL`, la app usa
PGlite y guarda los datos en `apps/server/data/pglite`. Para usar un PostgreSQL propio, define `DATABASE_URL` en `.env`.

```bash
npm install
cp .env.example .env      # opcional en desarrollo
npm run dev               # API en :3001 y web en http://localhost:5173
```

Para probar la cámara desde el móvil en la misma red Wi-Fi, el navegador exige HTTPS:

```bash
HTTPS=1 npm run dev -w @ocryon/web   # y en otra terminal: npm run dev -w @ocryon/server
```

Abre `https://<ip-de-tu-pc>:5173` en el móvil y acepta el certificado de desarrollo. Sin HTTPS, el botón «Tomar fotos» abre la cámara del sistema como alternativa.

### Producción

```bash
npm run build
NODE_ENV=production JWT_SECRET=... ENCRYPTION_KEY=... npm start   # http://localhost:3001
```

¿Tenías datos en la versión anterior (SQLite, `apps/server/data/ocryon.db`)? Cópialos a la base actual
(debe estar vacía) con:

```bash
npm run import:sqlite -w @ocryon/server
```

### Docker (Hexper Ops / Dokploy)

El `Dockerfile` de la raíz compila la web y la API y deja un único proceso Node que sirve ambas
en **`0.0.0.0:8080`** (`EXPOSE 8080`) como usuario sin privilegios. Incluye un `HEALTHCHECK`
contra `http://127.0.0.1:8080/`. Al arrancar aplica todas las migraciones pendientes (de forma
idempotente y con un candado de PostgreSQL, así que es seguro con varias réplicas) **antes** de
aceptar tráfico.

En Hexper Ops: ruta `/`, puerto automático y **PostgreSQL automático** (inyecta `DATABASE_URL`).

```bash
docker build -t ocryon .
docker run -d -p 8080:8080 \
  -e DATABASE_URL=<cadena de conexión> -e JWT_SECRET=<secreto> -e ENCRYPTION_KEY=<secreto> ocryon
```

Variables de entorno (se configuran en el panel del servidor, nunca en Git):

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | Sí, en producción | PostgreSQL. Hexper Ops la inyecta sola. Sin ella se usa PGlite dentro del contenedor y **los datos se pierden en cada despliegue** (salvo que se monte un volumen en `/data`). |
| `JWT_SECRET` | Sí | Firma de las sesiones. Mínimo 16 caracteres (`openssl rand -hex 32`). Sin ella el contenedor no arranca. |
| `ENCRYPTION_KEY` | Sí | Cifra las API keys guardadas. Mínimo 16 caracteres. **No la cambies después**: las claves ya guardadas dejarían de poder leerse. |
| `OCRSPACE_API_KEY`, `GEMINI_API_KEY` | No | Claves globales para los usuarios que no pongan las suyas. |
| `AUTH_RATE_LIMIT` | No | Intentos de login/registro por IP cada 15 min (20 por defecto). |

`PORT=8080` y `HOST=0.0.0.0` ya vienen fijados en la imagen.

> **HTTPS obligatorio:** en producción la cookie de sesión es `Secure`, así que la app debe
> abrirse por `https://` (el dominio del proxy). Por `http://` no se podrá iniciar sesión.

### Tests

```bash
npm test          # tests de la API (auth, ajustes, escaneos, búsqueda, aislamiento entre usuarios)
npm run typecheck
npm run test:e2e  # pruebas en navegador (móvil y escritorio) de todos los módulos
```

Las pruebas E2E levantan su propio servidor en otros puertos, con una base de datos temporal y un
simulador local de OCR.space y Gemini, así que no gastan tus API keys. La primera vez instala el
navegador con `npx playwright install chromium`.

## API keys

- **OCR.space**: clave gratuita en <https://ocr.space/ocrapi/freekey> (límite de 1 MB por imagen; la app comprime las fotos automáticamente).
- **Gemini**: clave en <https://aistudio.google.com/apikey>.

Se configuran por usuario en **Ajustes** o globalmente con `OCRSPACE_API_KEY` / `GEMINI_API_KEY`.

## Próximos pasos

- Modo offline completo (PWA con *service worker*, guardado local y sincronización).
- Recorte y enderezado automático de páginas antes del OCR.
- Exportar a PDF/DOCX, etiquetas y carpetas en el catálogo.
- Tema oscuro.
