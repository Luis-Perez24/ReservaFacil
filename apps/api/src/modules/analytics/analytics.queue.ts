export const ANALYTICS_QUEUE = 'analytics';

/** Nombre del job y clave del scheduler: ambos fijos, uno solo posible a la vez. */
export const ANALYTICS_REFRESH_JOB = 'refresh-views';

/**
 * Cada cuánto se refrescan las vistas materializadas. No es un dato en
 * tiempo real como la expiración de holds (`EXPIRATION_SWEEP_INTERVAL_MS`,
 * 60s) — un dashboard de métricas de negocio no necesita el segundo exacto.
 */
export const ANALYTICS_REFRESH_INTERVAL_MS = 300_000;
