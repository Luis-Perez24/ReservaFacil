export const EXPIRATION_QUEUE = 'expiration';

/** Nombre del job y clave del scheduler: ambos fijos, uno solo posible a la vez. */
export const EXPIRATION_SWEEP_JOB = 'sweep-expired';

/**
 * Cada cuánto corre la barrida. El hold dura 10 min (`HOLD_MINUTES`); un
 * minuto de holgura entre "venció" y "el job lo nota" es aceptable frente al
 * costo de barrer más seguido.
 */
export const EXPIRATION_SWEEP_INTERVAL_MS = 60_000;
