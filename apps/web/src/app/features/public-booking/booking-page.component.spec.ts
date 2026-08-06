import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  PublicAvailabilityResponse,
  PublicServiceResponse,
  PublicTenantResponse,
  ReservationResponse,
  SlotTakenEvent,
} from '@reservafacil/contracts';
import { EMPTY, Observable, of, throwError } from 'rxjs';

import { PublicBookingApi } from '../../core/api/public-booking.api';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { BookingPageComponent } from './booking-page.component';

const NEGOCIO: PublicTenantResponse = {
  name: 'Barbería Demo',
  slug: 'barberia-demo',
  timezone: 'America/Santiago',
  branding: {
    logoUrl: null,
    primaryColor: '#c2410c',
    coverImageUrl: null,
    tagline: null,
    about: null,
    team: null,
    address: null,
    hours: null,
  },
};

const SERVICIOS: PublicServiceResponse[] = [
  { id: 's-1', name: 'Corte de pelo', durationMin: 30, priceClp: 12000 },
  { id: 's-2', name: 'Corte + barba', durationMin: 45, priceClp: 18000 },
];

const DISPONIBILIDAD: PublicAvailabilityResponse = {
  serviceId: 's-1',
  date: '2027-01-04',
  timezone: 'America/Santiago',
  slots: [
    { startsAt: '2027-01-04T12:00:00.000Z', endsAt: '2027-01-04T12:30:00.000Z' },
    { startsAt: '2027-01-04T12:30:00.000Z', endsAt: '2027-01-04T13:00:00.000Z' },
  ],
};

function reservaPendiente(minutos = 10): ReservationResponse {
  return {
    id: 'r-1',
    serviceId: 's-1',
    status: 'PENDING',
    startsAt: '2027-01-04T12:00:00.000Z',
    endsAt: '2027-01-04T12:30:00.000Z',
    expiresAt: new Date(Date.now() + minutos * 60_000).toISOString(),
    priceClp: 12000,
    attended: null,
  };
}

/** Doble del cliente HTTP: los tests no tocan la red. */
class ApiDoble {
  tenant: Observable<PublicTenantResponse> = of(NEGOCIO);
  services: Observable<PublicServiceResponse[]> = of(SERVICIOS);
  availability: Observable<PublicAvailabilityResponse> = of(DISPONIBILIDAD);
  reservation: Observable<ReservationResponse> = of(reservaPendiente());
  createdWith: unknown = null;

  findTenant(): Observable<PublicTenantResponse> {
    return this.tenant;
  }

  findServices(): Observable<PublicServiceResponse[]> {
    return this.services;
  }

  findAvailability(): Observable<PublicAvailabilityResponse> {
    return this.availability;
  }

  createReservation(_slug: string, body: unknown): Observable<ReservationResponse> {
    this.createdWith = body;
    return this.reservation;
  }
}

/** Sin socket real: en tests no se abre una conexión que nadie va a cerrar. */
class RealtimeDoble {
  watchTenant(): Observable<SlotTakenEvent> {
    return EMPTY;
  }
}

describe('BookingPageComponent', () => {
  let fixture: ComponentFixture<BookingPageComponent>;
  let api: ApiDoble;

  /**
   * `toObservable` emite el slug en el siguiente tick, así que hay que dejar
   * correr los efectos antes de leer el DOM: sin la espera se lee la pantalla
   * de "cargando".
   */
  async function montar(slug = 'barberia-demo'): Promise<HTMLElement> {
    fixture = TestBed.createComponent(BookingPageComponent);
    fixture.componentRef.setInput('slug', slug);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  async function estabilizar(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function click(el: HTMLElement, selector: string): void {
    (el.querySelector(selector) as HTMLElement).click();
  }

  beforeEach(async () => {
    api = new ApiDoble();

    await TestBed.configureTestingModule({
      imports: [BookingPageComponent],
      providers: [
        provideRouter([]),
        { provide: PublicBookingApi, useValue: api },
        { provide: RealtimeService, useValue: new RealtimeDoble() },
      ],
    }).compileComponents();
  });

  describe('elegir servicio', () => {
    it('muestra el negocio y sus servicios', async () => {
      const el = await montar();

      expect(el.querySelector('.topbar')?.textContent).toContain('Barbería Demo');
      expect(el.querySelectorAll('.entry').length).toBe(2);
      expect(el.querySelector('.entry__name')?.textContent).toContain('Corte de pelo');
    });

    it('formatea el precio en pesos chilenos y la duración en minutos', async () => {
      const el = await montar();
      const primera = el.querySelector('.entry');

      expect(primera?.querySelector('.entry__price')?.textContent).toContain('12.000');
      expect(primera?.querySelector('.entry__duration')?.textContent).toContain('30 min');
    });

    it('aplica el color del negocio como token --brand', async () => {
      const el = await montar();
      const booking = el.querySelector('.booking') as HTMLElement;

      expect(booking.style.getPropertyValue('--brand')).toBe('#c2410c');
    });

    it('sin color propio deja el token por defecto', async () => {
      api.tenant = of({ ...NEGOCIO, branding: null });
      const el = await montar();
      const booking = el.querySelector('.booking') as HTMLElement;

      expect(booking.style.getPropertyValue('--brand')).toBe('');
    });

    it('un negocio inexistente se distingue de una falla de conexión', async () => {
      api.tenant = throwError(() => new HttpErrorResponse({ status: 404 }));
      const el = await montar('no-existe');

      expect(el.textContent).toContain('Este negocio no existe');
      expect(el.querySelector('.topbar')).toBeNull();
    });

    it('una falla de conexión invita a reintentar', async () => {
      api.tenant = throwError(() => new HttpErrorResponse({ status: 500 }));
      const el = await montar();

      expect(el.textContent).toContain('No pudimos cargar la reserva');
    });

    it('un negocio sin servicios lo dice en vez de mostrar una lista vacía', async () => {
      api.services = of([]);
      const el = await montar();

      expect(el.textContent).toContain('todavía no publicó servicios');
      expect(el.querySelectorAll('.entry').length).toBe(0);
    });
  });

  describe('elegir horario', () => {
    it('al elegir un servicio muestra las horas libres de ese día', async () => {
      const el = await montar();

      click(el, '.entry__button');
      await estabilizar();

      const slots = el.querySelectorAll('.slot');
      expect(slots.length).toBe(2);
      // Los slots viajan en UTC y se muestran en la hora del negocio (UTC-3 en enero).
      expect(slots[0].textContent?.trim()).toBe('09:00');
    });

    it('propone por defecto el día de hoy en el negocio, no el del navegador', async () => {
      const el = await montar();
      click(el, '.entry__button');
      await estabilizar();

      const hoyEnSantiago = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
      }).format(new Date());
      const input = el.querySelector('input[type="date"]') as HTMLInputElement;

      expect(input.value).toBe(hoyEnSantiago);
    });

    it('un día sin horas libres lo dice', async () => {
      api.availability = of({ ...DISPONIBILIDAD, slots: [] });
      const el = await montar();

      click(el, '.entry__button');
      await estabilizar();

      expect(el.textContent).toContain('No quedan horas libres');
    });
  });

  describe('reservar', () => {
    async function llegarAlFormulario(): Promise<HTMLElement> {
      const el = await montar();
      click(el, '.entry__button');
      await estabilizar();
      click(el, '.slot');
      await estabilizar();

      return el;
    }

    function completarFormulario(el: HTMLElement): void {
      const nombre = el.querySelector('input[formControlName="clientName"]') as HTMLInputElement;
      const email = el.querySelector('input[formControlName="clientEmail"]') as HTMLInputElement;

      nombre.value = 'Pedro Cliente';
      nombre.dispatchEvent(new Event('input'));
      email.value = 'pedro@cliente.cl';
      email.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('al elegir una hora pide los datos con el turno resumido', async () => {
      const el = await llegarAlFormulario();

      expect(el.querySelector('.ticket')?.textContent).toContain('Corte de pelo');
      expect(el.querySelector('form')).toBeTruthy();
    });

    it('no reserva con el formulario vacío y marca el error', async () => {
      const el = await llegarAlFormulario();

      (el.querySelector('button[type="submit"]') as HTMLElement).click();
      await estabilizar();

      expect(api.createdWith).toBeNull();
      expect(el.textContent).toContain('Escribe tu nombre');
    });

    it('reserva y pasa a la cuenta regresiva', async () => {
      const el = await llegarAlFormulario();
      completarFormulario(el);

      (el.querySelector('button[type="submit"]') as HTMLElement).click();
      await estabilizar();

      expect(api.createdWith).toEqual(
        jasmine.objectContaining({
          serviceId: 's-1',
          startsAt: '2027-01-04T12:00:00.000Z',
          clientName: 'Pedro Cliente',
          clientEmail: 'pedro@cliente.cl',
        }),
      );
      expect(el.textContent).toContain('Tu hora está reservada');
      expect(el.querySelector('.countdown')?.textContent?.trim()).toMatch(/^(9:5\d|10:00)$/);
    });

    it('si alguien gana la carrera por el horario lo explica y vuelve a la agenda', async () => {
      const el = await llegarAlFormulario();
      completarFormulario(el);
      api.reservation = throwError(() => new HttpErrorResponse({ status: 409 }));

      (el.querySelector('button[type="submit"]') as HTMLElement).click();
      await estabilizar();

      expect(el.textContent).toContain('Justo tomaron ese horario');
      // Vuelve a la elección de hora: el formulario ya no está.
      expect(el.querySelector('form')).toBeNull();
    });
  });
});
