/**
 * Webpay limita el `buy_order` a 26 caracteres (`BUY_ORDER_LENGTH` en el SDK,
 * que además lo valida). Un UUID son 36, así que `{reservation_id}-{attempt}`
 * tal cual no entra: se usa un prefijo del UUID sin guiones más el intento.
 *
 * 20 caracteres hex son 80 bits: la colisión es despreciable, y de todos modos
 * quien garantiza la unicidad de verdad es el `UNIQUE (buy_order)` de la tabla.
 * La trazabilidad hacia la reserva no depende de este string sino de la FK
 * `reservation_id` de `payments`.
 */
const UUID_PREFIX_LENGTH = 20;

/** Tope de Webpay. Si algún día se supera, es mejor fallar acá que en Transbank. */
export const BUY_ORDER_MAX_LENGTH = 26;

export function buildBuyOrder(reservationId: string, attempt: number): string {
  const compact = reservationId.replace(/-/g, '').slice(0, UUID_PREFIX_LENGTH);
  const buyOrder = `${compact}-${attempt}`;

  if (buyOrder.length > BUY_ORDER_MAX_LENGTH) {
    throw new Error(
      `buy_order "${buyOrder}" supera los ${BUY_ORDER_MAX_LENGTH} caracteres que acepta Webpay`,
    );
  }

  return buyOrder;
}
