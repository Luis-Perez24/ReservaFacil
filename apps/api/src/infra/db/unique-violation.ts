import { QueryFailedError } from 'typeorm';

/** Violación de constraint único en Postgres. */
const UNIQUE_VIOLATION = '23505';

interface PostgresDriverError {
  code?: string;
  constraint?: string;
}

/**
 * Preguntar "¿existe?" y después insertar deja una ventana en la que otro
 * request inserta lo mismo. Insertar y atrapar el 23505 no la deja: la BD
 * decide, no la aplicación.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as PostgresDriverError | undefined;

  return driverError?.code === UNIQUE_VIOLATION && driverError.constraint === constraint;
}
