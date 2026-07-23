import { BUY_ORDER_MAX_LENGTH, buildBuyOrder } from './buy-order';

describe('buildBuyOrder', () => {
  const RESERVATION_ID = '3ee9ce72-3892-49ab-ad1e-1408913f612f';

  it('arma el buy_order con el prefijo del uuid y el intento', () => {
    expect(buildBuyOrder(RESERVATION_ID, 1)).toBe('3ee9ce72389249abad1e-1');
  });

  it('nunca supera el largo que acepta Webpay', () => {
    for (const attempt of [1, 9, 42, 999, 99999]) {
      expect(buildBuyOrder(RESERVATION_ID, attempt).length).toBeLessThanOrEqual(
        BUY_ORDER_MAX_LENGTH,
      );
    }
  });

  it('distingue los intentos de la misma reserva', () => {
    expect(buildBuyOrder(RESERVATION_ID, 1)).not.toBe(buildBuyOrder(RESERVATION_ID, 2));
  });

  it('distingue reservas distintas', () => {
    const otra = '9f8b1c2d-0000-4000-8000-000000000000';

    expect(buildBuyOrder(RESERVATION_ID, 1)).not.toBe(buildBuyOrder(otra, 1));
  });

  it('falla antes de llamar a Transbank si el intento es absurdo', () => {
    // 20 del uuid + '-' + 6 dígitos = 27: no entra en los 26 de Webpay.
    expect(() => buildBuyOrder(RESERVATION_ID, 123456)).toThrow(/supera los 26/);
  });
});
