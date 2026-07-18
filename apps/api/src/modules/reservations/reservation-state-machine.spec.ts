import { ReservationStatus } from '@reservafacil/contracts';

import {
  InvalidStateTransitionError,
  assertTransition,
  canTransition,
  isTerminal,
} from './reservation-state-machine';

const { PENDING, PAID, CONFIRMED, EXPIRED, CANCELLED } = ReservationStatus;

describe('canTransition', () => {
  it.each([
    [PENDING, PAID],
    [PENDING, EXPIRED],
    [PENDING, CANCELLED],
    [PAID, CONFIRMED],
    [CONFIRMED, CANCELLED],
  ])('permite %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    // Saltarse el pago.
    [PENDING, CONFIRMED],
    // Revivir estados terminales.
    [EXPIRED, PENDING],
    [CANCELLED, PENDING],
    // Retroceder.
    [PAID, PENDING],
    [CONFIRMED, PAID],
    // Un PAID no expira: ya hay plata de por medio.
    [PAID, EXPIRED],
    // Nadie transiciona a sí mismo.
    [PENDING, PENDING],
    [CONFIRMED, CONFIRMED],
  ])('rechaza %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe('assertTransition', () => {
  it('no lanza en una transición válida', () => {
    expect(() => assertTransition(PENDING, PAID)).not.toThrow();
  });

  it('lanza InvalidStateTransitionError en una inválida', () => {
    expect(() => assertTransition(CONFIRMED, PENDING)).toThrow(InvalidStateTransitionError);
  });

  it('el error nombra la transición que falló', () => {
    expect(() => assertTransition(CANCELLED, PAID)).toThrow('CANCELLED → PAID');
  });
});

describe('isTerminal', () => {
  it.each([EXPIRED, CANCELLED])('%s es terminal', (status) => {
    expect(isTerminal(status)).toBe(true);
  });

  it.each([PENDING, PAID, CONFIRMED])('%s no es terminal', (status) => {
    expect(isTerminal(status)).toBe(false);
  });
});
