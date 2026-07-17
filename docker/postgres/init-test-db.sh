#!/bin/bash
# Crea la base de datos de tests junto a la de desarrollo. Solo corre la primera
# vez que se inicializa el volumen de postgres.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE "${POSTGRES_DB}_test";
EOSQL
