/** YYYY-MM-DD de hoy, en UTC (alcanza para default de rango, no para cálculo de negocio). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `days` atrás de `to` (inclusive), YYYY-MM-DD. */
export function daysBeforeIso(to: string, days: number): string {
  const date = new Date(`${to}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Todas las fechas YYYY-MM-DD entre `from` y `to`, inclusive. */
export function eachDateIso(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}
