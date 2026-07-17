import { DateTime } from 'luxon';

/**
 * Cálculo puro de slots libres: reglas − excepciones − reservas activas.
 * Sin BD ni inyección: recibe todo resuelto y devuelve instantes UTC.
 *
 * Las horas de reglas y excepciones son "de pared" (wall-clock) en el timezone
 * del negocio: "abre a las 09:00" significa 09:00 en el reloj local, también
 * los días de cambio de hora. Por eso cada slot se construye con
 * `DateTime.fromObject` en la zona, y no sumando minutos a la medianoche —
 * sumar minutos correría los horarios en cada transición de DST.
 */

export interface SlotWindow {
  /** 'HH:mm' o 'HH:mm:ss' (la BD hidrata time con segundos). */
  startTime: string;
  endTime: string;
  slotIntervalMin: number;
}

export interface DayException {
  closed: boolean;
  startTime: string | null;
  endTime: string | null;
}

export interface BusyRange {
  startsAt: Date;
  endsAt: Date;
}

export interface ComputedSlot {
  startsAt: Date;
  endsAt: Date;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** [aStart, aEnd) se solapa con [bStart, bEnd). Tocarse en el borde no es solaparse. */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Resuelve qué ventanas de atención tiene el día: la excepción gana sobre las
 * reglas. Cerrado anula todo; horario especial reemplaza las ventanas del día
 * (hereda la granularidad más fina de las reglas, o `fallbackIntervalMin` si
 * el día no tenía reglas).
 */
export function resolveDayWindows(
  rules: SlotWindow[],
  exception: DayException | null,
  fallbackIntervalMin: number,
): SlotWindow[] {
  if (!exception) {
    return rules;
  }

  if (exception.closed || !exception.startTime || !exception.endTime) {
    return [];
  }

  const interval =
    rules.length > 0 ? Math.min(...rules.map((r) => r.slotIntervalMin)) : fallbackIntervalMin;

  return [
    {
      startTime: exception.startTime,
      endTime: exception.endTime,
      slotIntervalMin: interval,
    },
  ];
}

export function computeFreeSlots(params: {
  /** Día local del negocio, 'YYYY-MM-DD'. */
  date: string;
  /** Timezone IANA del negocio. */
  timezone: string;
  /** Duración del servicio consultado. */
  durationMin: number;
  windows: SlotWindow[];
  /** Reservas activas del día, instantes UTC. */
  busy: BusyRange[];
  /** Inyectado para poder testear "solo slots futuros" sin depender del reloj. */
  now: Date;
}): ComputedSlot[] {
  const { date, timezone, durationMin, windows, busy, now } = params;
  const day = DateTime.fromISO(date, { zone: timezone });

  if (!day.isValid) {
    return [];
  }

  const slots: ComputedSlot[] = [];

  for (const window of windows) {
    const windowStart = timeToMinutes(window.startTime);
    const windowEnd = timeToMinutes(window.endTime);

    for (
      let cursor = windowStart;
      cursor + durationMin <= windowEnd;
      cursor += window.slotIntervalMin
    ) {
      const startsAt = day
        .set({ hour: Math.floor(cursor / 60), minute: cursor % 60, second: 0, millisecond: 0 })
        .toJSDate();
      // El fin es duración real: un corte de 60 min dura 60 min también el
      // día que el reloj salta.
      const endsAt = DateTime.fromJSDate(startsAt).plus({ minutes: durationMin }).toJSDate();

      if (startsAt <= now) {
        continue;
      }

      const isTaken = busy.some(
        (range) => startsAt < range.endsAt && range.startsAt < endsAt,
      );

      if (!isTaken) {
        slots.push({ startsAt, endsAt });
      }
    }
  }

  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
