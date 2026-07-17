import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';

import { validateEnv } from '../config/env.validation';
import { buildTypeOrmOptions } from './typeorm-options';

/**
 * DataSource para la CLI de TypeORM (`migration:run`, `migration:revert`).
 * La aplicación no usa este archivo: ella arma sus opciones vía ConfigService.
 *
 * `loadEnvFile` es de Node 22 — evita traer dotenv solo para esto.
 */
const envPath = resolve(process.cwd(), '../../.env');

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

export const dataSourceOptions = buildTypeOrmOptions(validateEnv(process.env));

export default new DataSource(dataSourceOptions);
