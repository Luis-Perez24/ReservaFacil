import type { ReservationStatus } from './reservations';

/**
 * Estados de un intento de pago. Calzan con el enum `payment_status` de
 * Postgres; no reordenar sin una migración.
 *
 *   INITIATED → APPROVED | REJECTED | FAILED
 *
 * `REJECTED` es un "no" del emisor de la tarjeta; `FAILED` es un problema
 * técnico (timeout, error de Transbank). Se distinguen porque llevan a
 * decisiones distintas: el rechazo se le muestra al cliente, la falla se revisa.
 */
export const PaymentStatus = {
  INITIATED: 'INITIATED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/**
 * Lo que necesita el navegador para ir a pagar: se hace un POST del `token`
 * al `url` de Webpay. El backend no redirige; solo entrega los datos.
 */
export interface InitPaymentResponse {
  url: string;
  token: string;
  buyOrder: string;
  amountClp: number;
}

/** Resultado del retorno de Webpay, ya procesado por el backend. */
export interface PaymentResultResponse {
  reservationId: string;
  /** Negocio de la reserva: con esto se arma la vuelta a su página pública. */
  slug: string;
  buyOrder: string;
  paymentStatus: PaymentStatus;
  /** Estado de la reserva después del pago: CONFIRMED solo si el pago fue aprobado. */
  reservationStatus: ReservationStatus;
  amountClp: number;
  /** Código de autorización de Transbank; solo si fue aprobado. */
  authorizationCode: string | null;
}
