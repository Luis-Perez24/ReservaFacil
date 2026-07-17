import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

import type { EnvironmentVariables } from '../config/env.validation';

/**
 * Única definición de las opciones de conexión. La usan el AppModule y la CLI
 * de migraciones: si vivieran por separado, tarde o temprano dejarían de
 * parecerse y las migraciones correrían contra otra base que la aplicación.
 */
type PostgresEnv = Pick<
  EnvironmentVariables,
  'POSTGRES_HOST' | 'POSTGRES_PORT' | 'POSTGRES_USER' | 'POSTGRES_PASSWORD' | 'POSTGRES_DB'
>;

export function buildTypeOrmOptions(env: PostgresEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    username: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
    entities: [join(__dirname, '../../modules/**/*.entity{.ts,.js}')],
    migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
    // Nunca true: en producción borra columnas para calzar con las entidades.
    // El esquema solo cambia por migración versionada (adr/0005).
    synchronize: false,
    migrationsRun: false,
  };
}
