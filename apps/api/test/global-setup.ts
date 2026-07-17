import { DataSource } from 'typeorm';

import { validateEnv } from '../src/infra/config/env.validation';
import { buildTypeOrmOptions } from '../src/infra/db/typeorm-options';
import { loadTestEnv } from './env-test';

/**
 * Deja el esquema de la base de tests al día antes de correr nada. Se migra,
 * no se sincroniza: los tests corren contra el mismo esquema que producción
 * (adr/0005).
 */
export default async function globalSetup(): Promise<void> {
  loadTestEnv();

  const dataSource = new DataSource(buildTypeOrmOptions(validateEnv(process.env)));

  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}
