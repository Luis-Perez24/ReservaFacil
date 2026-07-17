import {
  computeFreeSlots,
  rangesOverlap,
  resolveDayWindows,
  timeToMinutes,
} from './slot-calculator';

// Chile: invierno = UTC-4, verano (DST) = UTC-3. El DST 2026 parte el
// domingo 6 de septiembre. Fechas elegidas a propósito para fijar el offset.
const SANTIAGO = 'America/Santiago';

/** Un "now" siempre anterior a las fechas de prueba: acá no se testea el filtro de pasado. */
const LONG_AGO = new Date('2020-01-01T00:00:00Z');

describe('timeToMinutes', () => {
  it('convierte HH:mm', () => {
    expect(timeToMinutes('09:30')).toBe(570);
  });

  it('acepta HH:mm:ss como hidrata la BD', () => {
    expect(timeToMinutes('09:30:00')).toBe(570);
  });
});

describe('rangesOverlap', () => {
  it('detecta solape parcial', () => {
    expect(rangesOverlap(540, 600, 570, 630)).toBe(true);
  });

  it('tocarse en el borde no es solaparse', () => {
    expect(rangesOverlap(540, 600, 600, 660)).toBe(false);
  });
});

describe('resolveDayWindows', () => {
  const rules = [
    { startTime: '09:00:00', endTime: '13:00:00', slotIntervalMin: 30 },
    { startTime: '15:00:00', endTime: '19:00:00', slotIntervalMin: 60 },
  ];

  it('sin excepción devuelve las reglas tal cual', () => {
    expect(resolveDayWindows(rules, null, 45)).toEqual(rules);
  });

  it('un día cerrado anula todas las ventanas', () => {
    expect(
      resolveDayWindows(rules, { closed: true, startTime: null, endTime: null }, 45),
    ).toEqual([]);
  });

  it('un horario especial reemplaza las reglas y hereda la granularidad más fina', () => {
    const windows = resolveDayWindows(
      rules,
      { closed: false, startTime: '10:00', endTime: '14:00' },
      45,
    );

    expect(windows).toEqual([{ startTime: '10:00', endTime: '14:00', slotIntervalMin: 30 }]);
  });

  it('sin reglas ese día, el horario especial usa el intervalo de respaldo', () => {
    const windows = resolveDayWindows(
      [],
      { closed: false, startTime: '10:00', endTime: '14:00' },
      45,
    );

    expect(windows[0].slotIntervalMin).toBe(45);
  });
});

describe('computeFreeSlots', () => {
  const baseParams = {
    date: '2026-07-20', // lunes de invierno chileno → UTC-4
    timezone: SANTIAGO,
    durationMin: 30,
    busy: [],
    now: LONG_AGO,
  };

  it('genera la grilla completa y en UTC correcto (invierno, UTC-4)', () => {
    const slots = computeFreeSlots({
      ...baseParams,
      windows: [{ startTime: '09:00', endTime: '11:00', slotIntervalMin: 30 }],
    });

    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-07-20T13:00:00.000Z',
      '2026-07-20T13:30:00.000Z',
      '2026-07-20T14:00:00.000Z',
      '2026-07-20T14:30:00.000Z',
    ]);
  });

  it('convierte con DST activo (verano, UTC-3)', () => {
    const slots = computeFreeSlots({
      ...baseParams,
      date: '2027-01-04', // lunes de verano chileno
      windows: [{ startTime: '09:00', endTime: '10:00', slotIntervalMin: 30 }],
    });

    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      '2027-01-04T12:00:00.000Z',
      '2027-01-04T12:30:00.000Z',
    ]);
  });

  it('descarta el slot que no alcanza a terminar dentro de la ventana', () => {
    const slots = computeFreeSlots({
      ...baseParams,
      durationMin: 60,
      windows: [{ startTime: '09:00', endTime: '10:30', slotIntervalMin: 30 }],
    });

    // 09:30+60 = 10:30 justo cabe; 10:00+60 = 11:00 se pasa.
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-07-20T13:00:00.000Z',
      '2026-07-20T13:30:00.000Z',
    ]);
  });

  it('resta una reserva que se solapa, aunque sea parcialmente', () => {
    const slots = computeFreeSlots({
      ...baseParams,
      windows: [{ startTime: '09:00', endTime: '11:00', slotIntervalMin: 30 }],
      // 13:15Z–13:45Z local 09:15–09:45: pisa los slots de 09:00 y 09:30.
      busy: [
        {
          startsAt: new Date('2026-07-20T13:15:00Z'),
          endsAt: new Date('2026-07-20T13:45:00Z'),
        },
      ],
    });

    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-07-20T14:00:00.000Z',
      '2026-07-20T14:30:00.000Z',
    ]);
  });

  it('no ofrece slots en el pasado', () => {
    const slots = computeFreeSlots({
      ...baseParams,
      windows: [{ startTime: '09:00', endTime: '11:00', slotIntervalMin: 30 }],
      // Son las 10:00 locales: solo quedan 10:00 y 10:30... y 10:00 ya empezó.
      now: new Date('2026-07-20T14:00:00Z'),
    });

    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-07-20T14:30:00.000Z',
    ]);
  });

  it('una fecha inválida devuelve vacío en vez de reventar', () => {
    const slots = computeFreeSlots({
      ...baseParams,
      date: '2026-02-30',
      windows: [{ startTime: '09:00', endTime: '11:00', slotIntervalMin: 30 }],
    });

    expect(slots).toEqual([]);
  });

  it('varias ventanas del mismo día salen ordenadas', () => {
    const slots = computeFreeSlots({
      ...baseParams,
      windows: [
        { startTime: '15:00', endTime: '16:00', slotIntervalMin: 30 },
        { startTime: '09:00', endTime: '10:00', slotIntervalMin: 30 },
      ],
    });

    const times = slots.map((s) => s.startsAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(slots).toHaveLength(4);
  });
});
