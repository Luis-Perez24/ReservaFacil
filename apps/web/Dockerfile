# Imagen del frontend. Multi-stage: se compila Angular con toda la toolchain y
# a la imagen final solo viaja el estático servido por nginx —sin Node, sin
# node_modules—. El resultado es una imagen chica y sin superficie de ataque
# de un runtime de JavaScript.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# ── build: instala el workspace y compila la SPA ────────────────────────────
FROM base AS build
# Igual que el api: manifiestos + contracts antes del install (el postinstall
# del root compila contracts, que el web consume para sus tipos).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts packages/contracts
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
RUN pnpm --filter @reservafacil/web build

# ── runtime: nginx sirviendo el estático ────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
# El application builder de Angular deja el estático en dist/web/browser.
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
