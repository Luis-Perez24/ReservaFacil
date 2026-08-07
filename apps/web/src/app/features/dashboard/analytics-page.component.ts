import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { ChartConfiguration } from 'chart.js';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AnalyticsApi } from '../../core/api/analytics.api';
import { ChartCanvasComponent } from './chart-canvas.component';
import { daysBeforeIso, eachDateIso, todayIso } from './date-range';

type DailyState =
  | { status: 'loading' }
  | { status: 'ready'; dates: string[]; revenueByDate: Map<string, number>; occupancyByDate: Map<string, number | null> }
  | { status: 'error' };

type TopServicesState =
  | { status: 'loading' }
  | { status: 'ready'; rows: { name: string; revenueClp: number }[] }
  | { status: 'error' };

/** Lee un color ya resuelto desde un custom property de CSS: Chart.js dibuja en canvas, no entiende `var(--x)` directo. */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const CLP = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

/** `Aug 4` en vez de `2027-08-04`: los ejes se leen mejor con menos ruido. */
function shortLabel(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00.000Z`).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * `/dashboard`, la página de métricas. Dos gráficos con la misma serie de
 * fechas en el eje X (adr/0008): ingresos rellena los días sin actividad con
 * 0 (es un hecho, no una inferencia), pero ocupación deja el hueco como
 * `null` con `spanGaps: false` — un día sin fila puede ser "nadie reservó" o
 * "el negocio estaba cerrado", y no hay forma de distinguirlos desde acá, así
 * que no se inventa un 0% que no se puede sostener.
 */
@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [ChartCanvasComponent],
  templateUrl: './analytics-page.component.html',
  styleUrl: './analytics-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsPageComponent {
  private readonly analyticsApi = inject(AnalyticsApi);

  private readonly defaultTo = todayIso();

  readonly to = signal(this.defaultTo);
  readonly from = signal(daysBeforeIso(this.defaultTo, 29));

  private readonly range = computed(() => ({ from: this.from(), to: this.to() }));

  readonly daily = toSignal(
    toObservable(this.range).pipe(
      switchMap(({ from, to }) =>
        this.analyticsApi.findDaily(from, to).pipe(
          map((rows): DailyState => {
            const dates = eachDateIso(from, to);
            const revenueByDate = new Map(dates.map((d) => [d, 0]));
            const occupancyByDate = new Map<string, number | null>(dates.map((d) => [d, null]));

            for (const row of rows) {
              revenueByDate.set(row.date, row.revenueClp);
              occupancyByDate.set(row.date, row.occupancyRate);
            }

            return { status: 'ready', dates, revenueByDate, occupancyByDate };
          }),
          catchError(() => of<DailyState>({ status: 'error' })),
          startWith<DailyState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as DailyState },
  );

  readonly topServices = toSignal(
    this.analyticsApi.findTopServices(5).pipe(
      map(
        (rows): TopServicesState => ({
          status: 'ready',
          rows: rows.map((row) => ({ name: row.serviceName, revenueClp: row.revenueClp })),
        }),
      ),
      catchError(() => of<TopServicesState>({ status: 'error' })),
      startWith<TopServicesState>({ status: 'loading' }),
    ),
    { initialValue: { status: 'loading' } as TopServicesState },
  );

  readonly totalRevenue = computed(() => {
    const state = this.daily();
    if (state.status !== 'ready') {
      return null;
    }
    return CLP.format([...state.revenueByDate.values()].reduce((sum, value) => sum + value, 0));
  });

  readonly revenueChart = computed<ChartConfiguration | null>(() => {
    const state = this.daily();
    if (state.status !== 'ready') {
      return null;
    }

    return {
      type: 'bar',
      data: {
        labels: state.dates.map(shortLabel),
        datasets: [
          {
            label: 'Ingresos',
            data: state.dates.map((date) => state.revenueByDate.get(date) ?? 0),
            backgroundColor: cssVar('--brand'),
            borderRadius: 4,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300, easing: 'easeOutCubic' },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => CLP.format(Number(ctx.raw)) } },
        },
        scales: {
          y: { ticks: { callback: (value) => CLP.format(Number(value)) } },
        },
      },
    };
  });

  readonly occupancyChart = computed<ChartConfiguration | null>(() => {
    const state = this.daily();
    if (state.status !== 'ready') {
      return null;
    }

    return {
      type: 'line',
      data: {
        labels: state.dates.map(shortLabel),
        datasets: [
          {
            label: 'Ocupación',
            data: state.dates.map((date) => {
              const rate = state.occupancyByDate.get(date);
              return rate === null || rate === undefined ? null : Math.round(rate * 100);
            }),
            borderColor: cssVar('--brand'),
            backgroundColor: cssVar('--brand'),
            spanGaps: false,
            tension: 0.35,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300, easing: 'easeOutCubic' },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.formattedValue}%` } },
        },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: (value) => `${value}%` } },
        },
      },
    };
  });

  readonly topServicesChart = computed<ChartConfiguration | null>(() => {
    const state = this.topServices();
    if (state.status !== 'ready') {
      return null;
    }

    return {
      type: 'bar',
      data: {
        labels: state.rows.map((row) => row.name),
        datasets: [
          {
            label: 'Ingresos',
            data: state.rows.map((row) => row.revenueClp),
            backgroundColor: cssVar('--brand'),
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300, easing: 'easeOutCubic' },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => CLP.format(Number(ctx.raw)) } },
        },
        scales: {
          x: { ticks: { callback: (value) => CLP.format(Number(value)) } },
        },
      },
    };
  });

  changeFrom(value: string): void {
    this.from.set(value);
  }

  changeTo(value: string): void {
    this.to.set(value);
  }
}
