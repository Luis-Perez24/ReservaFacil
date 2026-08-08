import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { ChartConfiguration, Plugin, ScriptableContext } from 'chart.js';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';

import { AnalyticsApi } from '../../core/api/analytics.api';
import { ThemeService } from '../../core/theme/theme.service';
import { ChartCanvasComponent } from './chart-canvas.component';
import { daysBeforeIso, eachDateIso, todayIso } from './date-range';

type DailyState =
  | { status: 'loading' }
  | {
      status: 'ready';
      dates: string[];
      revenueByDate: Map<string, number>;
      occupancyByDate: Map<string, number | null>;
      reservationsByDate: Map<string, number>;
      totalNoShowCount: number;
      totalAttendanceChecked: number;
    }
  | { status: 'error' };

const PERCENT = new Intl.NumberFormat('es-CL', {
  style: 'percent',
  maximumFractionDigits: 0,
});

type TopServicesState =
  | { status: 'loading' }
  | { status: 'ready'; rows: { name: string; revenueClp: number }[] }
  | { status: 'error' };

/**
 * "Ocupación por día" es una foto de la semana actual, no del rango que se
 * esté analizando en los otros gráficos —por eso no comparte `daily`—: son
 * siempre los últimos 7 días, sin importar qué `from`/`to` haya elegido el
 * dueño para ingresos.
 */
type WeeklyOccupancyState =
  | { status: 'loading' }
  | { status: 'ready'; dates: string[]; occupancyByDate: Map<string, number | null> }
  | { status: 'error' };

/**
 * Lee un color ya resuelto desde un custom property de CSS: Chart.js dibuja en
 * canvas, no entiende `var(--x)` directo. Lee desde `.dashboard` y no desde
 * `<html>`: los tokens de tema (claro/oscuro) están escopados a propósito a
 * `.dashboard` (para que nunca se filtren a la página pública), así que
 * `document.documentElement` solo vería los valores base de `:root`.
 */
function cssVar(name: string): string {
  const scope = document.querySelector('.dashboard') ?? document.documentElement;
  return getComputedStyle(scope).getPropertyValue(name).trim();
}

/** `#1d4ed8` → `rgba(29, 78, 216, alpha)`. Chart.js necesita alpha real para degradados, no `color-mix`. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const value = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Versión "apagada" de un color: el estado natural de la barra, como un LED que todavía no prendió. */
function dim(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const r = Math.max(0, parseInt(clean.slice(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(clean.slice(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(clean.slice(4, 6), 16) - amount);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Halo de neón detrás de la barra bajo el cursor: sin esto un cambio de
 * `backgroundColor` no "brilla", solo cambia de color. Redibuja el elemento
 * activo con `shadowBlur` del color vívido (`hoverBackgroundColor`), no del
 * apagado — el brillo tiene que ser el color "encendido", no el de reposo.
 */
const ledGlowPlugin: Plugin = {
  id: 'ledGlow',
  afterDatasetsDraw(chart) {
    const active = chart.getActiveElements();
    if (active.length === 0) {
      return;
    }

    const { ctx } = chart;
    for (const { datasetIndex, index } of active) {
      // El tipo base `Element` de Chart.js no declara `draw` pese a que todo
      // elemento concreto (barras incluidas) lo implementa en runtime.
      const element = chart.getDatasetMeta(datasetIndex).data[index] as unknown as {
        draw: (ctx: CanvasRenderingContext2D) => void;
      };
      const dataset = chart.data.datasets[datasetIndex];
      const glowColors = dataset.hoverBackgroundColor;
      const glowColor = Array.isArray(glowColors) ? String(glowColors[index]) : String(glowColors);

      if (!element || !glowColor) {
        continue;
      }

      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 20;
      element.draw(ctx);
      ctx.restore();
    }
  },
};

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
  imports: [ChartCanvasComponent, LucideAngularModule],
  templateUrl: './analytics-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsPageComponent {
  private readonly analyticsApi = inject(AnalyticsApi);
  private readonly theme = inject(ThemeService);

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
            const reservationsByDate = new Map(dates.map((d) => [d, 0]));
            let totalNoShowCount = 0;
            let totalAttendanceChecked = 0;

            for (const row of rows) {
              revenueByDate.set(row.date, row.revenueClp);
              occupancyByDate.set(row.date, row.occupancyRate);
              reservationsByDate.set(row.date, row.reservationsCount);
              totalNoShowCount += row.noShowCount;
              totalAttendanceChecked += row.attendanceCheckedCount;
            }

            return {
              status: 'ready',
              dates,
              revenueByDate,
              occupancyByDate,
              reservationsByDate,
              totalNoShowCount,
              totalAttendanceChecked,
            };
          }),
          catchError(() => of<DailyState>({ status: 'error' })),
          startWith<DailyState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as DailyState },
  );

  /** Últimos 7 días terminando hoy, fijo — no depende de `from`/`to`. */
  readonly weeklyOccupancy = toSignal(
    this.analyticsApi.findDaily(daysBeforeIso(todayIso(), 6), todayIso()).pipe(
      map((rows): WeeklyOccupancyState => {
        const dates = eachDateIso(daysBeforeIso(todayIso(), 6), todayIso());
        const occupancyByDate = new Map<string, number | null>(dates.map((d) => [d, null]));

        for (const row of rows) {
          occupancyByDate.set(row.date, row.occupancyRate);
        }

        return { status: 'ready', dates, occupancyByDate };
      }),
      catchError(() => of<WeeklyOccupancyState>({ status: 'error' })),
      startWith<WeeklyOccupancyState>({ status: 'loading' }),
    ),
    { initialValue: { status: 'loading' } as WeeklyOccupancyState },
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

  /** Suma simple sobre el rango: sumar reservas por día es seguro (a diferencia de promediar una tasa, adr/0008). */
  readonly totalReservations = computed(() => {
    const state = this.daily();
    if (state.status !== 'ready') {
      return null;
    }
    return [...state.reservationsByDate.values()].reduce((sum, value) => sum + value, 0);
  });

  /**
   * Suma numerador y denominador del rango completo y divide al final —nunca
   * promediar la tasa diaria (adr/0008), mismo motivo por el que `totalRevenue`
   * suma en vez de promediar precios. `null` mientras nadie haya marcado
   * asistencia en el rango: no hay denominador con el que dividir.
   */
  readonly noShowRate = computed(() => {
    const state = this.daily();
    if (state.status !== 'ready' || state.totalAttendanceChecked === 0) {
      return null;
    }
    return PERCENT.format(state.totalNoShowCount / state.totalAttendanceChecked);
  });

  readonly revenueChart = computed<ChartConfiguration | null>(() => {
    // Se lee sin usar el valor: solo para que Angular registre la dependencia
    // y recalcule (con los colores del tema correcto) cuando se cambia de
    // modo, no solo al cargar la página.
    this.theme.isDark();
    const state = this.daily();
    if (state.status !== 'ready') {
      return null;
    }

    // Colors matching CSS variables dynamically for chart
    const brandColor = cssVar('--brand') || '#3b82f6';
    const surfaceColor = cssVar('--surface') || '#ffffff';

    return {
      type: 'line', // Changed to line to match mockup
      data: {
        labels: state.dates.map(shortLabel),
        datasets: [
          {
            label: 'Ingresos',
            data: state.dates.map((date) => state.revenueByDate.get(date) ?? 0),
            borderColor: brandColor,
            // Degradado real sobre el canvas (no un rgba plano fijo): se ve
            // sólido arriba, junto a la línea, y se apaga hacia abajo — el
            // "layered look" del mockup, no un bloque de color parejo.
            backgroundColor: (context: ScriptableContext<'line'>) => {
              const { ctx, chartArea } = context.chart;
              if (!chartArea) {
                return hexToRgba(brandColor, 0.15);
              }
              const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              gradient.addColorStop(0, hexToRgba(brandColor, 0.35));
              gradient.addColorStop(1, hexToRgba(brandColor, 0));
              return gradient;
            },
            borderWidth: 3,
            fill: true,
            tension: 0.4, // smooth curves like mockup
            pointRadius: 0, // hide points by default
            pointHoverRadius: 6,
            pointBackgroundColor: surfaceColor,
            pointBorderColor: brandColor,
            pointBorderWidth: 2,
          },
        ],
      },
        options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 500, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: cssVar('--paper') || '#ffffff',
            titleColor: cssVar('--ink-soft') || '#64748b',
            bodyColor: cssVar('--ink') || '#0f172a',
            borderColor: cssVar('--line') || '#e2e8f0',
            borderWidth: 1,
            padding: 12,
            boxPadding: 6,
            usePointStyle: true,
            callbacks: { label: (ctx) => CLP.format(Number(ctx.raw)) }
          },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: cssVar('--ink-soft') || '#94a3b8' } },
          y: { border: { display: false, dash: [4, 4] }, grid: { color: cssVar('--line') || '#e2e8f0' }, ticks: { color: cssVar('--ink-soft') || '#94a3b8', callback: (value) => CLP.format(Number(value)) } },
        },
      },
    };
  });

  readonly occupancyChart = computed<ChartConfiguration | null>(() => {
    this.theme.isDark();
    const state = this.weeklyOccupancy();
    if (state.status !== 'ready') {
      return null;
    }

    const brandColor = cssVar('--brand') || '#3b82f6';
    const availableColor = cssVar('--occupancy-available') || '#d6e2f9';

    // Dos series que suman 100 y se apilan (`stacked: true` en ambos ejes):
    // "Ocupado" es el dato real, "Disponible" es el resto hasta el 100% del
    // día — visualmente son dos tonos del mismo bloque, no una medición aparte.
    const occupiedPct = state.dates.map((date) => {
      const rate = state.occupancyByDate.get(date);
      return rate === null || rate === undefined ? null : Math.round(rate * 100);
    });
    const availablePct = occupiedPct.map((pct) => (pct === null ? null : 100 - pct));

    return {
      type: 'bar',
      data: {
        labels: state.dates.map(shortLabel),
        datasets: [
          {
            label: 'Ocupado',
            data: occupiedPct,
            backgroundColor: brandColor,
            borderRadius: 4,
            maxBarThickness: 32,
          },
          {
            label: 'Disponible',
            data: availablePct,
            backgroundColor: availableColor,
            borderRadius: 4,
            maxBarThickness: 32,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: cssVar('--paper') || '#ffffff',
            titleColor: cssVar('--ink-soft') || '#64748b',
            bodyColor: cssVar('--ink') || '#0f172a',
            borderColor: cssVar('--line') || '#e2e8f0',
            borderWidth: 1,
            padding: 12,
            callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue}%` },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { display: false },
            ticks: { color: cssVar('--ink-soft') || '#94a3b8' },
          },
          y: {
            stacked: true,
            border: { display: false },
            grid: { color: cssVar('--line') || '#e2e8f0' },
            min: 0,
            max: 100,
            ticks: { color: cssVar('--ink-soft') || '#94a3b8', callback: (value) => `${value}%` },
          },
        },
      },
    };
  });

  readonly topServicesChart = computed<ChartConfiguration | null>(() => {
    this.theme.isDark();
    const state = this.topServices();
    if (state.status !== 'ready') {
      return null;
    }

    const barColors = [
      '#4ea4ff', // blue-500
      '#25bc8a', // emerald-500
      '#4648c1', // indigo-500
      '#f8a922', // amber-500
      '#eb55a0', // pink-500
    ];

    return {
      type: 'bar',
      plugins: [ledGlowPlugin],
      data: {
        labels: state.rows.map((row) => row.name),
        datasets: [
          {
            label: 'Ingresos',
            data: state.rows.map((row) => row.revenueClp),
            // En reposo, apagado; al pasar el mouse, el color vívido +
            // el halo del plugin — la barra "prende" como un LED, no se
            // aclara hacia blanco.
            backgroundColor: barColors.map((color) => dim(color, 60)),
            hoverBackgroundColor: barColors,
            borderRadius: 6,
            barThickness: 16,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'easeOutQuart' },
        // `nearest`+`intersect` para que solo la barra bajo el cursor prenda
        // — con el default 'index' se encenderían todas a la vez.
        hover: { mode: 'nearest', intersect: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: cssVar('--paper') || '#ffffff',
            titleColor: cssVar('--ink-soft') || '#64748b',
            bodyColor: cssVar('--ink') || '#0f172a',
            borderColor: cssVar('--line') || '#e2e8f0',
            borderWidth: 1,
            padding: 12,
            callbacks: { label: (ctx) => CLP.format(Number(ctx.raw)) }
          },
        },
        scales: {
          x: { border: { display: false }, grid: { color: cssVar('--line') || '#e2e8f0' }, ticks: { color: cssVar('--ink-soft') || '#94a3b8', callback: (value) => CLP.format(Number(value)) } },
          y: { grid: { display: false }, border: { display: false }, ticks: { color: cssVar('--ink-soft') || '#94a3b8', font: { weight: 'bold' } } },
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
