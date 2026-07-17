import { loadTestEnv } from './env-test';

// Corre antes de importar AppModule: ConfigModule lee un entorno que ya apunta
// a la base de tests.
loadTestEnv();
