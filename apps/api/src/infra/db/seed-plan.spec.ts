import { ReservationStatus } from '@reservafacil/contracts';
import { DateTime } from 'luxon';

import { DEMO_BUSINESSES } from './seed-data';
import { RANDOM_SEED, createRandom, planReservations } from './seed-plan';

/**
 * El seed escribe con el repositorio, saltándose la validación del servicio de
 * reservas. Sin estas pruebas, un error acá sembraría estados que el motor de
 * reservas nunca habría aceptado —dos horas encima, una a las tres de la
 * mañana— y la demo mostraría algo que el producto no permite.
 *
 * La fecha es fija a propósito: cae dentro de las excepciones de los negocios
 * de demostración, que si no quedarían fuera de la ventana sembrada.
 */
const AHORA = DateTime.fromISO('2026-09-10T12:00:00', { zone: 'America/Santiago' });

describe('planReservations', () => {
  for (const business of DEMO_BUSINESSES) {
    describe(business.name, () => {
      const planned = planReservations(business, createRandom(RANDOM_SEED), AHORA);

      it('siembra reservas', () => {
        expect(planned.length).toBeGreaterThan(0);
      });

      it('nunca deja dos reservas encima', () => {
        const porDia = new Map<string, { from: DateTime; to: DateTime }[]>();

        for (const item of planned) {
          const dia = item.startsAt.toISODate() ?? '';
          const delDia = porDia.get(dia) ?? [];

          // El solapamiento se mide contra todos los servicios, no solo el
          // mismo: es la invariante que sostiene el lock por rango (adr/0002).
          const pisa = delDia.some(
            (busy) => item.startsAt < busy.to && item.endsAt > busy.from,
          );

          expect(pisa).toBe(false);
          delDia.push({ from: item.startsAt, to: item.endsAt });
          porDia.set(dia, delDia);
        }
      });

      it('respeta el horario de atención de cada día', () => {
        const rulesByDay = new Map(business.rules.map((rule) => [rule.dayOfWeek, rule]));
        const exceptionsByDate = new Map(business.exceptions.map((item) => [item.date, item]));

        for (const item of planned) {
          const dia = item.startsAt.startOf('day');
          const exception = exceptionsByDate.get(dia.toISODate() ?? '');
          const rule = rulesByDay.get(dia.weekday % 7);

          expect(exception?.closed).not.toBe(true);
          expect(rule).toBeDefined();

          const [abreHora, abreMin] = (exception?.startTime ?? rule!.startTime).split(':');
          const [cierraHora, cierraMin] = (exception?.endTime ?? rule!.endTime).split(':');
          const abre = dia.set({ hour: Number(abreHora), minute: Number(abreMin) });
          const cierra = dia.set({ hour: Number(cierraHora), minute: Number(cierraMin) });

          expect(item.startsAt >= abre).toBe(true);
          // Termina antes del cierre: nadie se queda a medio corte con el local cerrado.
          expect(item.endsAt <= cierra).toBe(true);
        }
      });

      it('le da a cada reserva la duración de su servicio', () => {
        for (const item of planned) {
          const service = business.services[item.serviceIndex];

          expect(item.endsAt.diff(item.startsAt, 'minutes').minutes).toBe(service.durationMin);
        }
      });

      it('solo marca asistencia en las que ya pasaron y se confirmaron', () => {
        for (const item of planned) {
          const yaPaso = item.endsAt < AHORA;

          if (yaPaso && item.status === ReservationStatus.CONFIRMED) {
            expect(typeof item.attended).toBe('boolean');
          } else {
            expect(item.attended).toBeNull();
          }
        }
      });

      it('no deja reservas futuras expiradas ni canceladas', () => {
        const futuras = planned.filter((item) => item.endsAt >= AHORA);

        expect(futuras.length).toBeGreaterThan(0);

        for (const item of futuras) {
          expect(item.status).toBe(ReservationStatus.CONFIRMED);
        }
      });

      it('da el mismo resultado con la misma semilla', () => {
        const otra = planReservations(business, createRandom(RANDOM_SEED), AHORA);

        expect(otra.map((item) => item.startsAt.toISO())).toEqual(
          planned.map((item) => item.startsAt.toISO()),
        );
      });
    });
  }

  it('salta los días que el negocio cerró por excepción', () => {
    const business = DEMO_BUSINESSES[0];
    const cerrado = business.exceptions.find((item) => item.closed);
    const planned = planReservations(business, createRandom(RANDOM_SEED), AHORA);

    expect(cerrado).toBeDefined();
    expect(planned.some((item) => item.startsAt.toISODate() === cerrado!.date)).toBe(false);
  });

  it('usa el horario especial cuando la excepción trae uno', () => {
    const business = DEMO_BUSINESSES.find((item) =>
      item.exceptions.some((exception) => !exception.closed),
    );
    const especial = business!.exceptions.find((exception) => !exception.closed)!;
    const planned = planReservations(business!, createRandom(RANDOM_SEED), AHORA);
    const delDia = planned.filter((item) => item.startsAt.toISODate() === especial.date);

    expect(delDia.length).toBeGreaterThan(0);

    // Ese día el club abre recién a las 16:00, no a las 08:00 de la regla.
    for (const item of delDia) {
      expect(item.startsAt.hour).toBeGreaterThanOrEqual(Number(especial.startTime!.split(':')[0]));
    }
  });
});
