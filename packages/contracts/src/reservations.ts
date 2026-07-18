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
}
