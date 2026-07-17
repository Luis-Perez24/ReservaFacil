import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Los e2e corren contra una base propia (`<db>_test`), creada por
 * `docker/postgres/init-test-db.sh`. Nunca contra la de desarrollo: un test
 * que trunca tablas no debe poder borrar los datos con los que trabajas.
 */
export function loadTestEnv(): void {
  const envPath = resolve(process.cwd(), '../../.env');

  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }

  process.env.NODE_ENV = 'test';

  if (!process.env.POSTGRES_DB?.endsWith('_test')) {
    process.env.POSTGRES_DB = `${process.env.POSTGRES_DB}_test`;
  }
}
