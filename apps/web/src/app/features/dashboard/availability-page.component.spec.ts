import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  AvailabilityExceptionResponse,
  AvailabilityRuleResponse,
  CreateAvailabilityExceptionRequest,
  CreateAvailabilityRuleRequest,
} from '@reservafacil/contracts';
import { Observable, of, throwError } from 'rxjs';

import { AvailabilityApi } from '../../core/api/availability.api';
import { AvailabilityPageComponent } from './availability-page.component';

const REGLA_LUNES: AvailabilityRuleResponse = {
  id: 'rule-1',
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '18:00',
  slotIntervalMin: 30,
};

const FERIADO: AvailabilityExceptionResponse = {
  id: 'exc-1',
  date: '2026-09-18',
  closed: true,
  startTime: null,
  endTime: null,
};

/** Doble de `AvailabilityApi`: los tests no tocan la red. */
class AvailabilityApiDoble {
  reglas: Observable<AvailabilityRuleResponse[]> = of([REGLA_LUNES]);
  excepciones: Observable<AvailabilityExceptionResponse[]> = of([FERIADO]);
  respuestaCreateRule: Observable<AvailabilityRuleResponse> = of({ ...REGLA_LUNES, id: 'rule-2' });
  respuestaCreateException: Observable<AvailabilityExceptionResponse> = of({ ...FERIADO, id: 'exc-2' });

  ultimaReglaCreada: CreateAvailabilityRuleRequest | null = null;
  ultimaReglaEliminada: string | null = null;
  ultimaExcepcionCreada: CreateAvailabilityExceptionRequest | null = null;
  ultimaExcepcionEliminada: string | null = null;

  findRules(): Observable<AvailabilityRuleResponse[]> {
    return this.reglas;
  }

  createRule(dto: CreateAvailabilityRuleRequest): Observable<AvailabilityRuleResponse> {
    this.ultimaReglaCreada = dto;
    return this.respuestaCreateRule;
  }

  deleteRule(id: string): Observable<void> {
    this.ultimaReglaEliminada = id;
    return of(undefined);
  }

  findExceptions(): Observable<AvailabilityExceptionResponse[]> {
    return this.excepciones;
  }

  createException(dto: CreateAvailabilityExceptionRequest): Observable<AvailabilityExceptionResponse> {
    this.ultimaExcepcionCreada = dto;
    return this.respuestaCreateException;
  }

  deleteException(id: string): Observable<void> {
    this.ultimaExcepcionEliminada = id;
    return of(undefined);
  }
}

describe('AvailabilityPageComponent', () => {
  let fixture: ComponentFixture<AvailabilityPageComponent>;
  let api: AvailabilityApiDoble;

  async function montar(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(AvailabilityPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  async function estabilizar(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function forms(el: HTMLElement): HTMLFormElement[] {
    return Array.from(el.querySelectorAll('form'));
  }

  function setValue(form: HTMLFormElement, selector: string, value: string): void {
    const input = form.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function submit(form: HTMLFormElement): void {
    (form.querySelector('button[type="submit"]') as HTMLElement).click();
  }

  function click(el: HTMLElement, selector: string): void {
    (el.querySelector(selector) as HTMLElement).click();
  }

  beforeEach(async () => {
    api = new AvailabilityApiDoble();

    await TestBed.configureTestingModule({
      imports: [AvailabilityPageComponent],
      providers: [{ provide: AvailabilityApi, useValue: api }],
    }).compileComponents();
  });

  it('lista las reglas semanales y las excepciones existentes', async () => {
    const el = await montar();

    expect(el.textContent).toContain('Lunes');
    expect(el.textContent).toContain('09:00');
    expect(el.textContent).toContain('2026-09-18');
    expect(el.textContent).toContain('Cerrado todo el día');
  });

  it('crea una regla nueva con los datos del formulario', async () => {
    const el = await montar();
    const [reglaForm] = forms(el);

    setValue(reglaForm, 'input[formControlName="startTime"]', '10:00');
    setValue(reglaForm, 'input[formControlName="endTime"]', '14:00');
    setValue(reglaForm, 'input[formControlName="slotIntervalMin"]', '15');
    submit(reglaForm);
    await estabilizar();

    expect(api.ultimaReglaCreada).toEqual({
      dayOfWeek: 1,
      startTime: '10:00',
      endTime: '14:00',
      slotIntervalMin: 15,
    });
  });

  it('muestra el 409 de solapamiento que devuelve el backend', async () => {
    const el = await montar();
    api.respuestaCreateRule = throwError(
      () =>
        new HttpErrorResponse({
          status: 409,
          error: { message: 'Ya existe una regla de 08:00 a 20:00 para este día.' },
        }),
    ) as unknown as Observable<AvailabilityRuleResponse>;

    submit(forms(el)[0]);
    await estabilizar();

    expect(el.textContent).toContain('Ya existe una regla de 08:00 a 20:00');
  });

  it('elimina una regla existente', async () => {
    const el = await montar();

    click(el, '.availability__row button');
    await estabilizar();

    expect(api.ultimaReglaEliminada).toBe('rule-1');
  });

  it('crea una excepción cerrada sin enviar horas', async () => {
    const el = await montar();
    const [, excepcionForm] = forms(el);

    setValue(excepcionForm, 'input[formControlName="date"]', '2026-12-25');
    submit(excepcionForm);
    await estabilizar();

    expect(api.ultimaExcepcionCreada).toEqual({ date: '2026-12-25', closed: true });
  });
});
