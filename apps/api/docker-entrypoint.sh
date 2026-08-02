#!/bin/sh
set -e

# Las migraciones corren en un solo lugar: el servicio que arranca con
# RUN_MIGRATIONS=true. Así el worker (misma imagen, sin la variable) no las
# toca, y varias réplicas del api no pisan la base a la vez. TypeORM salta las
# ya aplicadas leyendo la tabla `migrations`, así que repetir el arranque es
# inofensivo. En un despliegue con varias réplicas esto se movería a un paso
# de release dedicado; para un solo proceso, el entrypoint alcanza.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "→ Aplicando migraciones pendientes"
  node node_modules/typeorm/cli.js migration:run -d dist/infra/db/data-source.js
fi

exec "$@"
