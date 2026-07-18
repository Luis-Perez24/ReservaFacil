import { ReservationStatus } from '@reservafacil/contracts';

/**
 * Transiciones válidas de una reserva (ver `03-modelo-datos.md`). Cualquier
 * transición fuera de este mapa es un bug, no un caso de negocio: por eso el
 * estado destino de `EXPIRED` y `CANCELLED` es vacío —son terminales— y no
 * existe, por ejemplo, `CONFIRMED → PENDING`.
 *
 *   PENDING ─┬─► PAID ─► CONFIRMED ─► CANCELLED
 *            ├─► EXPIRED
 *            └─► CANCELLED
 *
 * Módulo puro, sin dependencias de framework: la lógica se prueba sola.
 */
const VALID_TRANSITIONS: Record<ReservationStatus, readonly ReservationStatus[]> = {
  [ReservationStatus.PENDING]: [
    ReservationStatus.PAID,
    ReservationStatus.EXPIRED,
    ReservationStatus.CANCELLED,
  ],
  [ReservationStatus.PAID]: [ReservationStatus.CONFIRMED],
  [ReservationStatus.CONFIRMED]: [ReservationStatus.CANCELLED],
  [ReservationStatus.EXPIRED]: [],
  [ReservationStatus.CANCELLED]: [],
};

/**
 * Se lanza al intentar una transición inválida. La capa HTTP la mapea a 422
 * (ver `04-convenciones.md`): es una regla de negocio violada, no un 500.
 */
export class InvalidStateTransitionError extends Error {
  constructor(
    readonly from: ReservationStatus,
    readonly to: ReservationStatus,
  ) {
    super(`Transición de reserva inválida: ${from} → ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ReservationStatus, to: ReservationStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

/** Un estado terminal no tiene transiciones salientes: la reserva ya no se mueve. */
export function isTerminal(status: ReservationStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0;
}
