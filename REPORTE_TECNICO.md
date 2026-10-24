# Reporte técnico de BiblioTru (Ocryon)

Este documento describe la implementación actual del repositorio: tecnologías, arquitectura, flujo de uso y algoritmos de escaneo. BiblioTru es la interfaz de la Biblioteca Pública del Estado Trujillo para digitalizar libros y documentos, consultar texto y organizar lecturas.

## Resumen ejecutivo

| Capa | Tecnología principal | Función |
| --- | --- | --- |
| Interfaz | React 19, TypeScript, Vite 8, Tailwind CSS 4 | Captura, revisión, catálogo, búsqueda y ajustes en móvil y PC. |
| API | Node.js 22+, Express 5, TypeScript | Autenticación, persistencia, OCR remoto y análisis con IA. |
| Datos | PostgreSQL (`pg`) o PGlite | Usuarios, ajustes, grupos, texto escaneado, documentos y búsqueda. |
| OCR local | Tesseract.js 7 | Reconocimiento en el navegador, sin enviar la imagen al servidor. |
| OCR remoto | OCR.space y Google Gemini | Reconocimiento mediante proveedores externos, a través de la API propia. |
| Pruebas | Vitest, Supertest, Playwright | API y recorridos de usuario en navegador. |

**Lenguaje predominante:** TypeScript en frontend y backend. Se usan SQL para datos y búsqueda, CSS para la interfaz, y scripts JavaScript para tareas de compilación. No hay un motor OCR propio entrenado en el proyecto: Tesseract, OCR.space y Gemini realizan el reconocimiento; el código del sistema prepara imágenes, coordina motores, revisa resultados y guarda texto.

## Arquitectura y recorrido de una página

```text
Cámara / archivo
    ↓
Normalización y compresión en navegador
    ↓
Cola local de páginas (React + IndexedDB)
    ├─ Tesseract.js → OCR local en navegador
    └─ API Express → OCR.space o Gemini → texto
    ↓
Revisión, corrección y orden de páginas
    ↓
Guardar texto en PostgreSQL/PGlite → catálogo y búsqueda
```

El monorepositorio usa npm workspaces: `apps/web` contiene la SPA y `apps/server` la API. En desarrollo Vite sirve la web y proxifica peticiones a la API; en producción el proceso Node sirve API y frontend compilado. La aplicación exige sesión para los datos personales.

### Uso cotidiano

1. En instalación nueva, configurar el primer Admin desde localhost con código de la consola o, en Docker público, mediante HTTPS y `SETUP_TOKEN` aleatorio configurado temporalmente. Personal indica su sala al registrarse y espera aprobación de Admin u Operador antes de iniciar sesión.
2. Elegir destino: libro/grupo o escaneo individual; seleccionar motor, idioma y modo automático o manual.
3. Tomar fotos o cargar imágenes; reordenar, girar o quitar páginas si hace falta.
4. Esperar el OCR, revisar el texto y corregir errores manualmente. Se puede reintentar una página.
5. Guardar páginas con texto; consultarlas desde el catálogo o mediante búsqueda, lectura, análisis y exportación.

Las fotografías pendientes permanecen en IndexedDB del dispositivo, separadas por usuario. Al guardar se envía **el texto**, no las imágenes: los blobs correspondientes se eliminan de la sesión local. Si la página aún no tiene texto puede quedar pendiente para procesarla después. Si falla IndexedDB, la cola solo vive en memoria.

## Cómo funciona el escaneo

### 1. Preparación de imagen

`apps/web/src/lib/image.ts` usa `createImageBitmap` para respetar la orientación de la foto; dibuja sobre un canvas blanco, limita el lado mayor a **2200 píxeles** y codifica en JPEG. Intenta mantener el resultado por debajo de aproximadamente **992 KiB**: empieza con calidad 0,88, la reduce y luego disminuye escala si hace falta, durante un máximo de ocho intentos. Se puede girar 90° una imagen mediante canvas. Esta preparación busca compatibilidad con los tres motores y el límite gratuito de OCR.space; no implementa recorte, enderezado automático ni mejora óptica avanzada.

### 2. Cola y progreso

`apps/web/src/scan/ScanSession.tsx` conserva páginas con estados `pending`, `queued`, `scanning`, `done` y `error`. Procesa **una página por vez**. El modo automático encola al añadir; el manual permite encolar cuando el usuario decide. Recupera una página que estaba `scanning` tras recargar como `queued`. Errores de configuración, autenticación o falta de conexión detienen las páginas restantes para permitir corregir el problema.

El progreso de subida remota es real hasta alrededor del 40 %; el resto se aproxima gradualmente hasta 95 % mientras espera al proveedor. Ese porcentaje **no mide el avance interno** de OCR.space ni Gemini. Tesseract sí emite eventos de progreso de reconocimiento. Los indicadores de progreso no se guardan en IndexedDB.

### 3. Tres motores de reconocimiento

| Motor | Dónde corre | Implementación y consideraciones |
| --- | --- | --- |
| Tesseract | Navegador | `tesseract.js` crea un worker con modo `LSTM_ONLY`; worker, núcleo y paquetes de idiomas se sirven desde `/tesseract` sin CDN. Se reutiliza por idioma y se termina el anterior al cambiar. Permite OCR sin conexión **si los recursos necesarios ya están disponibles**; no implica que toda la aplicación sea una PWA offline. |
| OCR.space | Proveedor externo, vía servidor | API recibe una imagen en memoria y envía multipart con idioma, `OCREngine=2`, `scale=true` y detección de orientación. Une `ParsedText` de resultados, normaliza saltos de línea y maneja errores del proveedor. |
| Gemini | Proveedor externo, vía servidor | Envía imagen codificada en base64 y un prompt que pide transcripción literal, orden de columnas, unión de palabras cortadas y omisión de numeración/cabeceras repetidas. El resultado depende del modelo y puede necesitar revisión humana. |

La ruta `POST /api/ocr` acepta JPEG, PNG o WEBP, limita tamaño y número de archivos, valida motor/idioma con Zod y aplica límite de solicitudes por usuario. Usa claves configuradas para cada usuario o globalmente; la imagen se mantiene en memoria del servidor durante la petición y no se escribe en disco. Tesseract no usa esa ruta: procesa el blob localmente. Los motores externos requieren internet y transmiten la imagen al proveedor correspondiente.

### 4. Postprocesamiento y guardado

El texto puede editarse antes de guardar. `apps/web/src/lib/page-number.ts` busca numeración impresa en las dos primeras o últimas líneas con patrones para dígitos, “Página/Pág./p.” y romanos minúsculos. Es una **heurística**, no garantía de detectar todos los números. Al guardar, `Scanner.tsx` envía texto, motor, idioma y etiqueta de página a la API, asociado a un grupo o como escaneo suelto.

## Búsqueda, análisis y documentos

- **Búsqueda:** tabla de escaneos con columna `tsvector` generada e índice GIN. PostgreSQL `to_tsquery('simple', …)` busca términos combinados con AND y el último como prefijo; `ts_rank` ordena resultados. Se normalizan acentos/mayúsculas en la representación de búsqueda y se filtra siempre por usuario. Hay filtros por grupo, categoría y tipo.
- **Análisis local:** `apps/web/src/lib/offline-analysis.ts` calcula conteos, tiempo estimado a 200 palabras/minuto, diversidad léxica, palabras clave por frecuencia, legibilidad Fernández Huerta con estimación de sílabas y resumen **extractivo** de oraciones puntuadas por términos frecuentes. Son métricas heurísticas, no comprensión semántica.
- **Análisis con IA:** backend integra Gemini para resúmenes y otras tareas de análisis cuando existe clave y conexión.
- **Documentos:** plantillas y extracción de campos mediante reglas locales o Gemini; revisión manual y exportación. La web genera archivos Word con `docx` y PDF con `pdfmake` a partir del texto guardado. No conserva fotografías del documento tras guardar.

## Librerías y responsabilidades

| Paquete | Uso en el sistema |
| --- | --- |
| `react`, `react-dom`, `react-router` | Componentes, estados, contexto y rutas. |
| `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite` | Desarrollo, empaquetado y estilos. |
| `lucide-react`, `clsx` | Iconos y composición de clases CSS. |
| `tesseract.js`, `@tesseract.js-data/*` | Worker OCR local e idiomas español, inglés, francés, alemán, italiano y portugués. |
| `idb-keyval` | Persistencia de fotos pendientes en IndexedDB. |
| `docx`, `pdfmake` | Exportación de documentos. |
| `express`, `multer`, `zod` | API, recepción temporal de imágenes y validación. |
| `pg`, `@electric-sql/pglite` | PostgreSQL real o embebido para desarrollo/pruebas. |
| `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `helmet`, `express-rate-limit` | Contraseñas, sesión, cookies, cabeceras de seguridad y límites de peticiones. |
| `vitest`, `supertest`, `@playwright/test` | Pruebas del servidor y E2E. |

## Seguridad y privacidad

Contraseñas se almacenan con bcrypt; la sesión utiliza JWT en cookie `httpOnly` y `SameSite=Lax`, con protección CSRF por cabecera. Las claves API de usuario se cifran con AES-256-GCM; las consultas de contenido se aíslan por usuario. Helmet aporta cabeceras de seguridad, y autenticación/OCR aplican límites de frecuencia. En producción debe usarse HTTPS para la cookie `Secure`. **Distinción importante:** OCR local evita enviar la imagen; OCR remoto sí comparte la imagen con el proveedor escogido. El texto guardado permanece en la base de datos del sistema.

### Roles y aprobación

La instalación no incluye credenciales predefinidas. El primer Admin se crea localmente con el código temporal de la consola o públicamente solo cuando se configura explícitamente un `SETUP_TOKEN` fuerte y la solicitud llega por HTTPS. Después de crear Admin, la transacción impide nuevas altas iniciales; se recomienda quitar `SETUP_TOKEN` y redesplegar. El registro público crea cuentas de Personal pendientes con sala. Admin y Operador pueden aprobar o rechazar; Operador puede consultar archivo y reportes globales, pero sus peticiones DELETE se bloquean en servidor. Admin puede designar operadores y borrar registros del archivo institucional. Las rutas normales de Personal siguen filtrando por `user_id`; la lectura global requiere el módulo administrativo protegido por rol. Una suspensión revoca acceso en cada petición porque la API consulta el estado actualizado de la cuenta.

## Cómo desarrollar y verificar

Requisito: Node.js **22.13 o superior**. Instalar dependencias en raíz con `npm install`. Sin `DATABASE_URL`, desarrollo usa PGlite; con ella, PostgreSQL. Las migraciones se aplican al iniciar. Variables como `JWT_SECRET`, `ENCRYPTION_KEY`, `OCRSPACE_API_KEY` y `GEMINI_API_KEY` se configuran mediante entorno; **no** se guardan en Git. Consultar `.env.example` y `README.md` para despliegue.

```bash
npm run dev        # servidor + web
npm run typecheck  # comprobar TypeScript
npm test           # pruebas del servidor
npm run test:e2e   # Playwright: recorridos móvil y escritorio
npm run build      # compilación web y API
npm start          # ejecutar compilación del servidor
```

Para navegar el código: empezar en `apps/web/src/App.tsx` (rutas), `apps/web/src/pages/Scanner.tsx` y `apps/web/src/scan/ScanSession.tsx` (experiencia OCR); seguir a `apps/web/src/lib/image.ts`/`tesseract.ts` y `apps/server/src/routes/ocr.ts`/`services/ocr/` (motores); revisar `apps/server/src/db/` y `routes/search.ts` (persistencia y consulta). El `README.md` explica despliegue, HTTPS y variables de entorno con mayor detalle.

## Límites actuales

OCR puede confundir caracteres, columnas, manuscritos o fotos borrosas: siempre conviene revisar el resultado. El reconocimiento sin conexión de Tesseract no equivale a sincronización offline completa. Recorte y enderezado automáticos, PWA con sincronización y otras mejoras figuran como próximos pasos del proyecto, no como funcionalidades terminadas.
