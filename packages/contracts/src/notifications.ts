/**
 * Calzan con los enums `reminder_channel` y `reminder_status` de Postgres,
 * ya creados en la migración inicial; no reordenar sin una migración.
 *
 * `TELEGRAM` está en la BD porque el esquema completo se migró desde el día 1
 * (docs/03-modelo-datos.md), pero hoy no tiene una implementación detrás: el
 * único canal activo es `EMAIL`. `WHATSAPP` sí tiene clase, apagada por
 * config (adr/0003).
 */
export const ReminderChannel = {
  EMAIL: 'EMAIL',
  TELEGRAM: 'TELEGRAM',
  WHATSAPP: 'WHATSAPP',
} as const;

export type ReminderChannel = (typeof ReminderChannel)[keyof typeof ReminderChannel];

/**
 *   PENDING → SENT | FAILED
 *
 * La fila se inserta en `PENDING` **antes** de intentar el envío: es lo que
 * hace idempotente un worker que muere a medio mandar (adr/0003).
 */
export const ReminderStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;

export type ReminderStatus = (typeof ReminderStatus)[keyof typeof ReminderStatus];
