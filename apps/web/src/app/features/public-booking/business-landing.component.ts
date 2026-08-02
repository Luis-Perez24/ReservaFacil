import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  OnDestroy,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { PublicTenantResponse, TeamMemberResponse } from '@reservafacil/contracts';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { PublicBookingApi } from '../../core/api/public-booking.api';
import { ParallaxDirective } from '../../shared/parallax.directive';
import { RevealOnScrollDirective } from '../../shared/reveal-on-scroll.directive';

/**
 * La página del negocio: su cara pública. Presenta el lugar (Inicio) y cuenta
 * quiénes son (Nosotros), y manda a reservar a `/:slug/reservar`. No carga el
 * flujo de reserva: quien viene a mirar no necesita ese peso, y quien viene a
 * reservar entra directo a la otra página.
 */
type PageState =
  | { status: 'loading' }
  | { status: 'ready'; tenant: PublicTenantResponse }
  | { status: 'not-found' }
  | { status: 'error' };

@Component({
  selector: 'app-business-landing',
  standalone: true,
  imports: [RouterLink, RevealOnScrollDirective, ParallaxDirective],
  templateUrl: './business-landing.component.html',
  styleUrl: './business-landing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessLandingComponent implements OnDestroy {
  /** Llega de la ruta `/:slug` por `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  private readonly api = inject(PublicBookingApi);
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);

  /** Sección visible ahora mismo, para resaltar su enlace en la barra. */
  private readonly activeSection = signal('inicio');
  readonly active = this.activeSection.asReadonly();
  private ticking = false;

  constructor() {
    // El scroll se escucha fuera de Angular; solo cuando la sección cambia
    // —algo esporádico— se vuelve a entrar para actualizar el signal.
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.onScroll, { passive: true });
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onScroll);
  }

  private readonly onScroll = (): void => {
    if (this.ticking) {
      return;
    }

    this.ticking = true;
    requestAnimationFrame(() => {
      this.updateActive();
      this.ticking = false;
    });
  };

  private updateActive(): void {
    // La sección "activa" es la última cuyo inicio ya pasó la línea del 35% de
    // la ventana: la que domina la pantalla.
    const probe = window.scrollY + window.innerHeight * 0.35;
    let current = 'inicio';

    for (const id of ['inicio', 'nosotros']) {
      const el = this.document.getElementById(id);
      if (el && el.offsetTop <= probe) {
        current = id;
      }
    }

    if (current !== this.activeSection()) {
      this.zone.run(() => this.activeSection.set(current));
    }
  }

  private readonly state = toSignal(
    toObservable(this.slug).pipe(
      switchMap((slug) =>
        this.api.findTenant(slug).pipe(
          map((tenant): PageState => ({ status: 'ready', tenant })),
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

  readonly brandColor = computed(() => this.tenant()?.branding?.primaryColor ?? null);
  readonly logoUrl = computed(() => this.tenant()?.branding?.logoUrl ?? null);
  readonly coverUrl = computed(() => this.tenant()?.branding?.coverImageUrl ?? null);
  readonly tagline = computed(() => this.tenant()?.branding?.tagline ?? null);
  readonly about = computed(() => this.tenant()?.branding?.about ?? null);
  readonly team = computed<TeamMemberResponse[]>(() => this.tenant()?.branding?.team ?? []);
  readonly address = computed(() => this.tenant()?.branding?.address ?? null);
  readonly hours = computed(() => this.tenant()?.branding?.hours ?? null);

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

  /** El texto de "Nosotros" viene con saltos dobles; se parte en párrafos. */
  readonly aboutParagraphs = computed(() =>
    (this.about() ?? '')
      .split('\n\n')
      .map((p) => p.trim())
      .filter(Boolean),
  );

  /**
   * ¿Hay sección Nosotros? Solo descripción o equipo la justifican: la dirección
   * y el horario viven en el footer, no acá.
   */
  readonly hasAbout = computed(() => !!this.about() || this.team().length > 0);

  /** Baja suave a una sección desde la barra de navegación. */
  scrollToSection(id: string): void {
    this.document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
