# Imagen del API. La misma imagen corre el worker con otro command
# (mismo código, distinto entrypoint): por eso acá no hay nada específico del
# proceso HTTP más allá del CMD por defecto.
#
# Multi-stage: se compila con toda la toolchain de desarrollo y a la imagen
# final solo viaja el resultado —dist + dependencias de producción—, sin pnpm,
# sin devDependencies y sin código fuente.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# corepack trae el pnpm fijado en package.json ("packageManager"): la misma
# versión en local, en CI y en la imagen.
RUN corepack enable
WORKDIR /repo

# ── build: instala el workspace completo y compila contracts + api ──────────
FROM base AS build
# Manifiestos + contracts entero antes del install: el `postinstall` del root
# compila contracts, y para eso necesita su código fuente, no solo su
# package.json. contracts es diminuto y cambia poco, así que copiarlo acá casi
# no cuesta cacheo; el install de api —lo caro— se reutiliza mientras no
# cambien los manifiestos ni contracts.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts packages/contracts
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# El código del api y su compilación (contracts ya quedó compilado en el install).
COPY apps/api apps/api
RUN pnpm --filter api build

# Árbol de dependencias de SOLO producción para el api, con @reservafacil/contracts
# ya compilado materializado adentro. pnpm deploy lo deja autocontenido en /prod
# (sin symlinks al store), listo para copiar tal cual a la imagen final.
# --legacy: contracts se consume como workspace normal (no inyectado), así que
# deploy copia su dist al node_modules del paquete en vez de exigir inyección.
RUN pnpm deploy --filter=api --prod --legacy /prod

# ── runtime: imagen mínima, sin toolchain ni devDependencies ────────────────
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# No corre como root: si el proceso se ve comprometido, no es dueño del contenedor.
RUN groupadd --system nodeapp \
 && useradd --system --gid nodeapp --home-dir /app nodeapp

# node_modules y package.json vienen del deploy (solo prod); el dist se copia
# aparte porque deploy no garantiza incluir artefactos gitignoreados.
COPY --from=build --chown=nodeapp:nodeapp /prod/node_modules ./node_modules
COPY --from=build --chown=nodeapp:nodeapp /prod/package.json ./package.json
COPY --from=build --chown=nodeapp:nodeapp /repo/apps/api/dist ./dist
COPY --chown=nodeapp:nodeapp apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nodeapp
EXPOSE 3000

# El entrypoint aplica migraciones pendientes (si RUN_MIGRATIONS=true) y luego
# ejecuta el CMD. El worker override el CMD por `node dist/main.worker.js`.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
