import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type {
  AvailabilitySlot,
  PublicServiceResponse,
  PublicTenantResponse,
  ReservationResponse,
} from '@reservafacil/contracts';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { postToWebpay } from '../../core/payments/webpay-redirect';
import { PublicBookingApi } from '../../core/api/public-booking.api';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { HoldCountdownComponent } from './hold-countdown.component';

/**
 * La página de reserva, con foco total en el flujo: elegir servicio, día y hora,
 * dejar los datos y pagar. Vive en `/:slug/reservar`, separada de la landing del
 * negocio para que quien viene a reservar no tenga ruido alrededor.
 */
type PageState =
  | { status: 'loading' }
  | { status: 'ready'; tenant: PublicTenantResponse; services: PublicServiceResponse[] }
  | { status: 'not-found' }
  | { status: 'error' };

type SlotsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; slots: SlotView[] }
  | { status: 'error' };

/** Slot ya formateado: el template no hace cuentas de zona horaria. */
interface SlotView {
  startsAt: string;
  label: string;
}

/** Servicio ya formateado para mostrar. */
interface ServiceRow {
  id: string;
  name: string;
  duration: string;
  price: string;
  raw: PublicServiceResponse;
}

@Component({
  selector: 'app-booking-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, HoldCountdownComponent],
  templateUrl: './booking-page.component.html',
  styleUrl: './booking-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingPageComponent {
  /** Llega de la ruta `/:slug/reservar` por `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  private readonly api = inject(PublicBookingApi);
  private readonly realtime = inject(RealtimeService);
  private readonly document = inject(DOCUMENT);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /** CLP no tiene decimales, y así se escribe un precio en Chile: $12.000. */
  private readonly clp = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  });

  private readonly state = toSignal(
    toObservable(this.slug).pipe(
      switchMap((slug) =>
        forkJoin({
          tenant: this.api.findTenant(slug),
          services: this.api.findServices(slug),
        }).pipe(
          map(({ tenant, services }): PageState => ({ status: 'ready', tenant, services })),
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

  readonly services = computed<ServiceRow[]>(() => {
    const state = this.state();

    if (state.status !== 'ready') {
      return [];
    }

    return state.services.map((service) => ({
      id: service.id,
      name: service.name,
      duration: `${service.durationMin} min`,
      price: this.clp.format(service.priceClp),
      raw: service,
    }));
  });

  // ── Paso 2: elegir horario ────────────────────────────────────────────────

  readonly selectedService = signal<ServiceRow | null>(null);
  readonly selectedSlot = signal<SlotView | null>(null);

  /** Null mientras la persona no elija: recién ahí pisa el día por defecto. */
  private readonly pickedDate = signal<string | null>(null);

  /**
   * El día por defecto es hoy **en el negocio**, no en el navegador: alguien
   * mirando desde otro huso vería la agenda del día equivocado.
   */
  readonly selectedDate = computed(() => {
    const picked = this.pickedDate();

    if (picked) {
      return picked;
    }

    const timezone = this.tenant()?.timezone;

    return timezone ? this.todayIn(timezone) : '';
  });

  /** Se incrementa para volver a pedir la agenda: lo usa el aviso en vivo. */
  private readonly reloadTick = signal(0);

  private readonly slotsRequest = computed(() => {
    const service = this.selectedService();
    const date = this.selectedDate();

    if (!service || !date) {
      return null;
    }

    return { slug: this.slug(), serviceId: service.id, date, tick: this.reloadTick() };
  });

  readonly slotsState = toSignal(
    toObservable(this.slotsRequest).pipe(
      switchMap((request) => {
        if (!request) {
          return of<SlotsState>({ status: 'idle' });
        }

        return this.api.findAvailability(request.slug, request.serviceId, request.date).pipe(
          map((response): SlotsState => {
            // 24 horas: una agenda chilena dice "15:30", no "03:30 p. m.", y en
            // una grilla de horas el sufijo además ocupa el doble de ancho.
            const formatter = new Intl.DateTimeFormat('es-CL', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: response.timezone,
            });

            return {
              status: 'ready',
              slots: response.slots.map((slot: AvailabilitySlot) => ({
                startsAt: slot.startsAt,
                label: formatter.format(new Date(slot.startsAt)),
              })),
            };
          }),
          catchError(() => of<SlotsState>({ status: 'error' })),
          startWith<SlotsState>({ status: 'loading' }),
        );
      }),
    ),
    { initialValue: { status: 'idle' } as SlotsState },
  );

  readonly slotsStatus = computed(() => this.slotsState().status);

  /** El template no puede estrechar la unión, así que se le da el array resuelto. */
  readonly slots = computed<SlotView[]>(() => {
    const state = this.slotsState();

    return state.status === 'ready' ? state.slots : [];
  });

  // ── Paso 3: datos del cliente ─────────────────────────────────────────────

  readonly form = this.fb.nonNullable.group({
    clientName: ['', [Validators.required, Validators.maxLength(120)]],
    clientEmail: ['', [Validators.required, Validators.email]],
    clientPhone: [''],
  });

  readonly submitting = signal(false);
  readonly bookingError = signal<string | null>(null);

  // ── Paso 4: reserva retenida, esperando el pago ───────────────────────────

  readonly reservation = signal<ReservationResponse | null>(null);
  readonly paying = signal(false);

  readonly holdExpired = signal(false);

  constructor() {
    // Alguien más tomó un horario: se vuelve a pedir la agenda del día que se
    // esté mirando. No se toca nada a mano; la fuente de verdad sigue siendo la API.
    effect((onCleanup) => {
      const slug = this.slug();
      const subscription = this.realtime
        .watchTenant(slug)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.reloadTick.update((tick) => tick + 1));

      onCleanup(() => subscription.unsubscribe());
    });
  }

  readonly brandColor = computed(() => this.tenant()?.branding?.primaryColor ?? null);

  readonly logoUrl = computed(() => this.tenant()?.branding?.logoUrl ?? null);

  /** El día elegido, en palabras, para el resumen del turno ("jue 27 jul"). */
  readonly dateLabel = computed(() => {
    const date = this.selectedDate();
    const timezone = this.tenant()?.timezone;

    if (!date || !timezone) {
      return null;
    }

    // `date` es 'YYYY-MM-DD' (día local del negocio); se ancla a mediodía UTC
    // para que el formateo por timezone no lo corra de día.
    return new Intl.DateTimeFormat('es-CL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: timezone,
    }).format(new Date(`${date}T12:00:00Z`));
  });

  /** "jue 27 jul · 09:00" para el turno; null hasta que haya hora elegida. */
  readonly ticketWhen = computed(() => {
    const slot = this.selectedSlot();

    return slot ? `${this.dateLabel()} · ${slot.label}` : null;
  });

  selectService(service: ServiceRow): void {
    this.selectedService.set(service);
    this.selectedSlot.set(null);
    this.bookingError.set(null);
  }

  changeDate(value: string): void {
    this.pickedDate.set(value);
    this.selectedSlot.set(null);
  }

  selectSlot(slot: SlotView): void {
    this.selectedSlot.set(slot);
    this.bookingError.set(null);
  }

  /** Vuelve a la lista de servicios sin arrastrar lo elegido antes. */
  reset(): void {
    this.selectedService.set(null);
    this.selectedSlot.set(null);
    this.pickedDate.set(null);
    this.reservation.set(null);
    this.holdExpired.set(false);
    this.bookingError.set(null);
    this.form.reset();
  }

  book(): void {
    const service = this.selectedService();
    const slot = this.selectedSlot();

    if (!service || !slot || this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.bookingError.set(null);

    const { clientName, clientEmail, clientPhone } = this.form.getRawValue();

    this.api
      .createReservation(this.slug(), {
        serviceId: service.id,
        startsAt: slot.startsAt,
        clientName,
        clientEmail,
        clientPhone: clientPhone || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reservation) => {
          this.submitting.set(false);
          this.reservation.set(reservation);
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          // 409 es el caso interesante: alguien ganó la carrera por ese horario.
          this.bookingError.set(
            error.status === 409
              ? 'Justo tomaron ese horario. Elige otro, la agenda ya está actualizada.'
              : 'No pudimos crear la reserva. Vuelve a intentar.',
          );
          this.selectedSlot.set(null);
          this.reloadTick.update((tick) => tick + 1);
        },
      });
  }

  pay(): void {
    const reservation = this.reservation();

    if (!reservation || this.paying()) {
      return;
    }

    this.paying.set(true);

    this.api
      .initPayment(this.slug(), reservation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (payment) => postToWebpay(payment.url, payment.token, this.document),
        error: () => {
          this.paying.set(false);
          this.bookingError.set('No pudimos iniciar el pago. Vuelve a intentar.');
        },
      });
  }

  /** Se venció la retención: el slot volvió a estar libre para cualquiera. */
  onHoldExpired(): void {
    this.holdExpired.set(true);
    this.reloadTick.update((tick) => tick + 1);
  }

  /** 'en-CA' entrega justo `YYYY-MM-DD`, que es lo que espera un input date. */
  private todayIn(timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  }
}
