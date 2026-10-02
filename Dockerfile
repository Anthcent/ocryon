# syntax=docker/dockerfile:1

# Ocryon: API (Express) + frontend compilado (React) servidos por el mismo proceso Node
# en 0.0.0.0:8080. Las migraciones de la base de datos se aplican al arrancar, antes de
# aceptar tráfico. Ningún secreto se incluye en la imagen: se configuran en tiempo de ejecución.

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
    DATABASE_PATH=/data/ocryon.db \
    WEB_DIST=/app/apps/web/dist
WORKDIR /app/apps/server

COPY --from=deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/apps/server/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/server/dist ./dist
COPY --from=build --chown=node:node /app/apps/web/dist /app/apps/web/dist
# Carpeta de datos (SQLite). Montar aquí un volumen persistente para conservar los datos entre despliegues.
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]
