# Ocryon: API (Express) + frontend compilado (React) servidos por el mismo proceso Node
# en 0.0.0.0:8080. Con DATABASE_URL usa PostgreSQL y aplica las migraciones pendientes al
# arrancar, antes de aceptar tráfico. Ningún secreto se incluye en la imagen: se configuran en tiempo de ejecución
# (si faltan JWT_SECRET / ENCRYPTION_KEY, el servidor los genera y guarda en la base de datos).

ARG NODE_IMAGE=node:24.21.0-alpine3.24

# ---- Compilación ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY apps/server apps/server
COPY apps/web apps/web
RUN npm run build -w @ocryon/web && npm run build -w @ocryon/server

# ---- Dependencias de producción (solo las del servidor) ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @ocryon/server --include-workspace-root=false --no-audit --no-fund \
  && npm cache clean --force

# ---- Imagen final ----
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    LISTEN_PORT=8080 \
    DATA_DIR=/data/pglite \
    WEB_DIST=/app/apps/web/dist
WORKDIR /app/apps/server

COPY --from=deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/apps/server/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/server/dist ./dist
COPY --from=build --chown=node:node /app/apps/web/dist /app/apps/web/dist
# Solo se usa si no hay DATABASE_URL (PostgreSQL embebido, sin persistencia salvo que se monte un volumen en /data).
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 8080
# start-period amplio: al desplegar, la app espera a que PostgreSQL esté listo antes de escuchar.
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]
