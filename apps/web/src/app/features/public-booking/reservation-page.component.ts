import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { PublicTenantResponse, ReservationResponse } from '@reservafacil/contracts';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { PublicBookingApi } from '../../core/api/public-booking.api';

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; tenant: PublicTenantResponse; reservation: ReservationResponse }
  | { status: 'not-found' }
  | { status: 'error' };

/**
 * Dónde termina el cliente después de Webpay. No confía en lo que venga por la
 * URL: le pregunta a la API en qué quedó la reserva. El estado que manda es el
 * de la base, no el del redirect.
 */
@Component({
  selector: 'app-reservation-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './reservation-page.component.html',
  styleUrl: './reservation-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReservationPageComponent {
  readonly slug = input.required<string>();
  readonly id = input.required<string>();

  private readonly api = inject(PublicBookingApi);

  private readonly clp = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  });

  private readonly state = toSignal(
    toObservable(computed(() => ({ slug: this.slug(), id: this.id() }))).pipe(
      switchMap(({ slug, id }) =>
        forkJoin({
          tenant: this.api.findTenant(slug),
          reservation: this.api.findReservation(slug, id),
        }).pipe(
          map(({ tenant, reservation }): PageState => ({ status: 'ready', tenant, reservation })),
          catchError((error: HttpErrorResponse) =>
            of<PageState>({ status: error.status === 404 ? 'not-found' : 'error' }),
          ),
          startWith<PageState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as PageState },
  );

  readonly status = computed(() => this.state().status);

  readonly tenant = computed(() => {
    const state = this.state();

    return state.status === 'ready' ? state.tenant : null;
  });

  readonly reservation = computed(() => {
    const state = this.state();

    return state.status === 'ready' ? state.reservation : null;
  });

  readonly brandColor = computed(() => this.tenant()?.branding?.primaryColor ?? null);

  /** Confirmada es la única que cuenta: el pago se aprobó y la hora es suya. */
  readonly confirmed = computed(() => this.reservation()?.status === 'CONFIRMED');

  /** Fecha y hora del turno, en el reloj del negocio. */
  readonly whenLabel = computed(() => {
    const reservation = this.reservation();
    const timezone = this.tenant()?.timezone;

    if (!reservation || !timezone) {
      return null;
    }

    // 24 horas, igual que la grilla de horarios: la misma hora no puede leerse
    // de dos formas distintas dentro del mismo flujo.
    return new Intl.DateTimeFormat('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(new Date(reservation.startsAt));
  });

  readonly priceLabel = computed(() => {
    const reservation = this.reservation();

    return reservation ? this.clp.format(reservation.priceClp) : null;
  });
}
