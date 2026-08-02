import { ReservationStatus } from '@reservafacil/contracts';
import { DateTime } from 'luxon';

import { DEMO_CLIENTS } from './seed-data';
import type { SeedBusiness, SeedRule } from './seed-data';

/**
 * Decide qué reservas sembrar. Está separado de `seed.ts` —que escribe en la
 * base— porque acá vive lo único que puede equivocarse de verdad: sembrar dos
 * reservas encima o una fuera del horario de atención. Sin base de datos de por
 * medio, eso se puede probar con un test unitario.
 */

const HISTORY_WEEKS = 6;
const FUTURE_DAYS = 14;
/** Proporción de slots del día que quedan tomados. */
const OCCUPANCY = 0.32;
/** De las reservas ya pasadas, cuántas terminaron en que el cliente no llegó. */
const NO_SHOW_RATE = 0.12;

export const RANDOM_SEED = 20260802;

export interface PlannedReservation {
  serviceIndex: number;
  clientIndex: number;
  startsAt: DateTime;
  endsAt: DateTime;
  status: ReservationStatus;
  attended: boolean | null;
  cancelledReason: string | null;
}

/**
 * Generador congruencial lineal. No se usa `Math.random` a propósito: con una
 * semilla fija, la demo se ve igual en cada máquina y en cada corrida.
 */
export function createRandom(seed: number): () => number {
  let state = seed % 2147483647;

  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function parseTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(':');
  return { hour: Number(hour), minute: Number(minute) };
}

/**
 * Recorre día por día aplicando las mismas reglas que usa el cálculo de
 * disponibilidad —regla semanal, menos excepción, menos lo ya tomado— para que
 * las reservas sembradas sean unas que el motor de reservas habría aceptado.
 */
export function planReservations(
  business: SeedBusiness,
  random: () => number,
  now: DateTime = DateTime.now(),
): PlannedReservation[] {
  const rulesByDay = new Map<number, SeedRule>(business.rules.map((rule) => [rule.dayOfWeek, rule]));
  const exceptionsByDate = new Map(business.exceptions.map((item) => [item.date, item]));

  const today = now.setZone(business.timezone).startOf('day');
  const firstDay = today.minus({ weeks: HISTORY_WEEKS });
  const lastDay = today.plus({ days: FUTURE_DAYS });
  const planned: PlannedReservation[] = [];

  for (let day = firstDay; day <= lastDay; day = day.plus({ days: 1 })) {
    const exception = exceptionsByDate.get(day.toISODate() ?? '');

    if (exception?.closed) {
      continue;
    }

    // Luxon numera lunes=1 … domingo=7; el modelo usa domingo=0 … sábado=6.
    const rule = rulesByDay.get(day.weekday % 7);

    if (!rule) {
      continue;
    }

    const opensAt = day.set(parseTime(exception?.startTime ?? rule.startTime));
    const closesAt = day.set(parseTime(exception?.endTime ?? rule.endTime));
    /** Lo ya tomado ese día, para no sembrar dos reservas encima. */
    const taken: { from: DateTime; to: DateTime }[] = [];

    for (let slot = opensAt; slot < closesAt; slot = slot.plus({ minutes: rule.slotIntervalMin })) {
      if (random() > OCCUPANCY) {
        continue;
      }

      const serviceIndex = Math.floor(random() * business.services.length);
      const service = business.services[serviceIndex];
      const endsAt = slot.plus({ minutes: service.durationMin });

      // El servicio tiene que caber antes del cierre y no pisar otra reserva.
      // El solapamiento se revisa contra todos los servicios, no solo el mismo:
      // es lo que hace el lock por rango al reservar de verdad (adr/0002).
      if (endsAt > closesAt) {
        continue;
      }

      if (taken.some((busy) => slot < busy.to && endsAt > busy.from)) {
        continue;
      }

      taken.push({ from: slot, to: endsAt });

      const isPast = endsAt < now;
      const draw = random();
      let status: ReservationStatus = ReservationStatus.CONFIRMED;
      let cancelledReason: string | null = null;

      if (isPast && draw < 0.08) {
        // Nunca la pagó: el job de expiración le soltó el slot.
        status = ReservationStatus.EXPIRED;
      } else if (isPast && draw < 0.14) {
        status = ReservationStatus.CANCELLED;
        cancelledReason = 'El cliente avisó que no podía venir';
      }

      const attended =
        isPast && status === ReservationStatus.CONFIRMED ? random() > NO_SHOW_RATE : null;

      planned.push({
        serviceIndex,
        clientIndex: Math.floor(random() * DEMO_CLIENTS.length),
        startsAt: slot,
        endsAt,
        status,
        attended,
        cancelledReason,
      });
    }
  }

  return planned;
}
