import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { PublicServiceResponse, PublicTenantResponse } from '@reservafacil/contracts';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { PublicBookingApi } from '../../core/api/public-booking.api';

/**
 * Un negocio que no existe y una API caída se ven distinto para quien entra:
 * el primero es un enlace equivocado, el segundo es "volvé a intentar". Por eso
 * son estados separados y no un único "error".
 */
type PageState =
  | { status: 'loading' }
  | { status: 'ready'; tenant: PublicTenantResponse; services: PublicServiceResponse[] }
  | { status: 'not-found' }
  | { status: 'error' };

/** Servicio ya formateado para mostrar: el template no hace cuentas ni formatos. */
interface ServiceRow {
  id: string;
  name: string;
  duration: string;
  price: string;
}

@Component({
  selector: 'app-public-booking-page',
  standalone: true,
  templateUrl: './public-booking-page.component.html',
  styleUrl: './public-booking-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicBookingPageComponent {
  /** Llega de la ruta `/:slug` por `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  private readonly api = inject(PublicBookingApi);

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
          // Cada slug nuevo vuelve a "cargando" antes de resolverse.
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
    }));
  });

  /**
   * El color del negocio pisa el token `--brand`. Si no cargó ninguno, se deja
   * el valor por defecto que ya define `styles.scss`.
   */
  readonly brandColor = computed(() => this.tenant()?.branding?.primaryColor ?? null);

  readonly logoUrl = computed(() => this.tenant()?.branding?.logoUrl ?? null);

  /**
   * `America/Santiago` es cómo lo guarda la base, no cómo se le habla a alguien
   * que quiere cortarse el pelo. Se muestra solo la ciudad.
   */
  readonly cityLabel = computed(() => {
    const timezone = this.tenant()?.timezone;

    if (!timezone) {
      return null;
    }

    return timezone.split('/').at(-1)?.replaceAll('_', ' ') ?? timezone;
  });
}
