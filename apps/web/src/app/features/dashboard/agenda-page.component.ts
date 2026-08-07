import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ReservationAgendaResponse, ReservationStatus } from '@reservafacil/contracts';

import { ReservationsApi } from '../../core/api/reservations.api';
import { daysBeforeIso, todayIso } from './date-range';

type AgendaState =
  | { status: 'loading' }
  | { status: 'ready'; rows: ReservationAgendaResponse[] }
  | { status: 'error' };

const CLP = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagada',
  CONFIRMED: 'Confirmada',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};

/**
 * `/dashboard/agenda`. A diferencia de servicios/horarios, el disparador de
 * recarga es el rango de fechas, no un alta/edición — por eso `reload()` se
 * llama también desde `changeFrom`/`changeTo`, no solo desde el constructor.
 * Tras marcar asistencia se actualiza la fila en memoria en vez de recargar
 * toda la lista: la respuesta del PATCH ya trae el estado real.
 */
@Component({
  selector: 'app-agenda-page',
  standalone: true,
  imports: [],
  templateUrl: './agenda-page.component.html',
  styleUrl: './agenda-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaPageComponent {
  private readonly reservationsApi = inject(ReservationsApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly defaultTo = todayIso();

  readonly to = signal(this.defaultTo);
  readonly from = signal(daysBeforeIso(this.defaultTo, 6));

  readonly state = signal<AgendaState>({ status: 'loading' });
  readonly markingId = signal<string | null>(null);

  readonly rows = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.rows : [];
  });

  constructor() {
    this.reload();
  }

  changeFrom(value: string): void {
    this.from.set(value);
    this.reload();
  }

  changeTo(value: string): void {
    this.to.set(value);
    this.reload();
  }

  reload(): void {
    this.state.set({ status: 'loading' });
    this.reservationsApi
      .findAgenda(this.from(), this.to())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.state.set({ status: 'ready', rows }),
        error: () => this.state.set({ status: 'error' }),
      });
  }

  formatClp(priceClp: number): string {
    return CLP.format(priceClp);
  }

  formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
  }

  statusLabel(status: ReservationStatus): string {
    return STATUS_LABEL[status];
  }

  /** Mismo criterio que valida `ReservationsService.markAttendance`: solo una CONFIRMED ya pasada. */
  canMarkAttendance(reservation: ReservationAgendaResponse): boolean {
    return (
      reservation.status === 'CONFIRMED' && new Date(reservation.startsAt).getTime() <= Date.now()
    );
  }

  markAttendance(reservation: ReservationAgendaResponse, attended: boolean): void {
    this.markingId.set(reservation.id);
    this.reservationsApi
      .markAttendance(reservation.id, attended)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.markingId.set(null);
          const state = this.state();
          if (state.status !== 'ready') {
            return;
          }
          this.state.set({
            status: 'ready',
            rows: state.rows.map((row) =>
              row.id === updated.id ? { ...row, attended: updated.attended } : row,
            ),
          });
        },
        error: () => this.markingId.set(null),
      });
  }
}
