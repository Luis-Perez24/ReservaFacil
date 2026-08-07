import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CreateServiceRequest, ServiceResponse, UpdateServiceRequest } from '@reservafacil/contracts';
import { Observable, of, throwError } from 'rxjs';

import { ServicesApi } from '../../core/api/services.api';
import { ServicesPageComponent } from './services-page.component';

const CORTE: ServiceResponse = { id: 'srv-1', name: 'Corte', durationMin: 30, priceClp: 8000, active: true };

/** Doble de `ServicesApi`: los tests no tocan la red. */
class ServicesApiDoble {
  lista: Observable<ServiceResponse[]> = of([CORTE]);
  respuestaCreate: Observable<ServiceResponse> = of({ ...CORTE, id: 'srv-2' });
  respuestaUpdate: Observable<ServiceResponse> = of(CORTE);
  respuestaDeactivate: Observable<void> = of(undefined);

  ultimaCreacion: CreateServiceRequest | null = null;
  ultimaEdicion: { id: string; dto: UpdateServiceRequest } | null = null;
  ultimaDesactivacion: string | null = null;

  findAll(): Observable<ServiceResponse[]> {
    return this.lista;
  }

  create(dto: CreateServiceRequest): Observable<ServiceResponse> {
    this.ultimaCreacion = dto;
    return this.respuestaCreate;
  }

  update(id: string, dto: UpdateServiceRequest): Observable<ServiceResponse> {
    this.ultimaEdicion = { id, dto };
    return this.respuestaUpdate;
  }

  deactivate(id: string): Observable<void> {
    this.ultimaDesactivacion = id;
    return this.respuestaDeactivate;
  }
}

describe('ServicesPageComponent', () => {
  let fixture: ComponentFixture<ServicesPageComponent>;
  let api: ServicesApiDoble;

  async function montar(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(ServicesPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  async function estabilizar(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function setValue(el: HTMLElement, selector: string, value: string): void {
    const input = el.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function click(el: HTMLElement, selector: string): void {
    (el.querySelector(selector) as HTMLElement).click();
  }

  beforeEach(async () => {
    api = new ServicesApiDoble();

    await TestBed.configureTestingModule({
      imports: [ServicesPageComponent],
      providers: [{ provide: ServicesApi, useValue: api }],
    }).compileComponents();
  });

  it('lista los servicios existentes', async () => {
    const el = await montar();

    expect(el.textContent).toContain('Corte');
    expect(el.textContent).toContain('30 min');
  });

  it('crea un servicio nuevo con los datos del formulario', async () => {
    const el = await montar();

    setValue(el, 'input[formControlName="name"]', 'Barba');
    setValue(el, 'input[formControlName="durationMin"]', '20');
    setValue(el, 'input[formControlName="priceClp"]', '5000');
    click(el, 'button[type="submit"]');
    await estabilizar();

    expect(api.ultimaCreacion).toEqual({ name: 'Barba', durationMin: 20, priceClp: 5000 });
  });

  it('no llama al backend si el formulario es inválido', async () => {
    const el = await montar();

    setValue(el, 'input[formControlName="name"]', '');
    click(el, 'button[type="submit"]');
    await estabilizar();

    expect(api.ultimaCreacion).toBeNull();
    expect(el.querySelector('.field__error')).not.toBeNull();
  });

  it('muestra el mensaje de error que devuelve el backend', async () => {
    const el = await montar();
    api.respuestaCreate = throwError(
      () => new HttpErrorResponse({ status: 400, error: { message: 'La duración debe ser un entero positivo.' } }),
    ) as unknown as Observable<ServiceResponse>;

    setValue(el, 'input[formControlName="name"]', 'Barba');
    click(el, 'button[type="submit"]');
    await estabilizar();

    expect(el.textContent).toContain('La duración debe ser un entero positivo.');
  });

  it('desactiva un servicio activo llamando al endpoint dedicado (soft delete)', async () => {
    const el = await montar();

    click(el, '.services__item-actions button:last-child');
    await estabilizar();

    expect(api.ultimaDesactivacion).toBe('srv-1');
  });
});
