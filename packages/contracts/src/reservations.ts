/**
 * Máquina de estados en `03-modelo-datos.md`. Los valores calzan con el enum
 * `reservation_status` de Postgres; no reordenar sin una migración.
 */
export const ReservationStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  CONFIRMED: 'CONFIRMED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;

export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

/**
 * Estados que **ocupan** el slot. Es el mismo conjunto del índice único parcial
 * `uq_reservation_active_slot`. Ojo: un `PENDING` con `expires_at < now()` está
 * en esta lista pero el lock lo trata como libre — esa condición temporal se
 * evalúa aparte, no acá.
 */
export const ACTIVE_RESERVATION_STATUSES = [
  ReservationStatus.PENDING,
  ReservationStatus.PAID,
  ReservationStatus.CONFIRMED,
] as const;

export interface CreateReservationRequest {
  serviceId: string;
  /** Inicio del slot, ISO 8601 UTC — uno de los que devuelve `availability`. */
  startsAt: string;
  /** Datos del cliente que reserva. `ends_at` y `price_clp` los pone el backend. */
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
}

export interface ReservationResponse {
  id: string;
  serviceId: string;
  status: ReservationStatus;
  startsAt: string;
  endsAt: string;
  /** Solo mientras está `PENDING`: cuándo expira la retención del slot. */
  expiresAt: string | null;
  priceClp: number;
  /** `null` hasta que el negocio la marque. Solo marcable sobre una CONFIRMED ya pasada. */
  attended: boolean | null;
}

/** PATCH del dashboard: el negocio marca si el cliente llegó a su hora. */
export interface MarkAttendanceRequest {
  attended: boolean;
}

/**
 * GET del dashboard: la agenda del negocio. A diferencia de `ReservationResponse`
 * (público, sin PII de terceros), acá el dueño necesita saber a quién le está
 * marcando la asistencia.
 */
export interface ReservationAgendaResponse extends ReservationResponse {
  serviceName: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
}
