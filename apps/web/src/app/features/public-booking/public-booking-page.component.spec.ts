import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { PublicServiceResponse, PublicTenantResponse } from '@reservafacil/contracts';
import { Observable, of, throwError } from 'rxjs';

import { PublicBookingApi } from '../../core/api/public-booking.api';
import { PublicBookingPageComponent } from './public-booking-page.component';

const NEGOCIO: PublicTenantResponse = {
  name: 'Barbería Demo',
  slug: 'barberia-demo',
  timezone: 'America/Santiago',
  branding: { logoUrl: null, primaryColor: '#c2410c' },
};

const SERVICIOS: PublicServiceResponse[] = [
  { id: 's-1', name: 'Corte de pelo', durationMin: 30, priceClp: 12000 },
  { id: 's-2', name: 'Corte + barba', durationMin: 45, priceClp: 18000 },
];

/** Doble del cliente HTTP: los tests no tocan la red. */
class ApiDoble {
  tenant: Observable<PublicTenantResponse> = of(NEGOCIO);
  services: Observable<PublicServiceResponse[]> = of(SERVICIOS);

  findTenant(): Observable<PublicTenantResponse> {
    return this.tenant;
  }

  findServices(): Observable<PublicServiceResponse[]> {
    return this.services;
  }
}

describe('PublicBookingPageComponent', () => {
  let fixture: ComponentFixture<PublicBookingPageComponent>;
  let api: ApiDoble;

  /**
   * `toObservable` emite el slug en el siguiente tick, así que hay que dejar
   * correr los efectos antes de leer el DOM: sin la espera se lee la pantalla
   * de "cargando".
   */
  async function montar(slug = 'barberia-demo'): Promise<HTMLElement> {
    fixture = TestBed.createComponent(PublicBookingPageComponent);
    fixture.componentRef.setInput('slug', slug);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    api = new ApiDoble();

    await TestBed.configureTestingModule({
      imports: [PublicBookingPageComponent],
      providers: [{ provide: PublicBookingApi, useValue: api }],
    }).compileComponents();
  });

  it('muestra el negocio y sus servicios', async () => {
    const el = await montar();

    expect(el.querySelector('.masthead__name')?.textContent).toContain('Barbería Demo');

    const entradas = el.querySelectorAll('.entry');
    expect(entradas.length).toBe(2);
    expect(entradas[0].textContent).toContain('Corte de pelo');
  });

  it('formatea el precio en pesos chilenos y la duración en minutos', async () => {
    const el = await montar();
    const primera = el.querySelector('.entry');

    // CLP sin decimales y con punto de miles.
    expect(primera?.querySelector('.entry__price')?.textContent).toContain('12.000');
    expect(primera?.querySelector('.entry__duration')?.textContent).toContain('30 min');
  });

  it('aplica el color del negocio como token --brand', async () => {
    const el = await montar();
    const page = el.querySelector('.page') as HTMLElement;

    expect(page.style.getPropertyValue('--brand')).toBe('#c2410c');
  });

  it('sin color propio deja el token por defecto', async () => {
    api.tenant = of({ ...NEGOCIO, branding: null });
    const el = await montar();
    const page = el.querySelector('.page') as HTMLElement;

    expect(page.style.getPropertyValue('--brand')).toBe('');
  });

  it('un negocio inexistente se distingue de una falla de conexión', async () => {
    api.tenant = throwError(() => new HttpErrorResponse({ status: 404 }));
    const el = await montar('no-existe');

    expect(el.textContent).toContain('Este negocio no existe');
    expect(el.querySelector('.masthead')).toBeNull();
  });

  it('una falla de conexión invita a reintentar', async () => {
    api.tenant = throwError(() => new HttpErrorResponse({ status: 500 }));
    const el = await montar();

    expect(el.textContent).toContain('No pudimos cargar el negocio');
  });

  it('un negocio sin servicios lo dice en vez de mostrar una lista vacía', async () => {
    api.services = of([]);
    const el = await montar();

    expect(el.textContent).toContain('todavía no publicó servicios');
    expect(el.querySelectorAll('.entry').length).toBe(0);
  });
});
