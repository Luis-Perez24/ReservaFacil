import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ChatResponse } from '@reservafacil/contracts';
import { Observable, of, throwError } from 'rxjs';

import { ChatApi } from '../../core/api/chat.api';
import { ChatWidgetComponent } from './chat-widget.component';

/** Doble de `ChatApi`: los tests no tocan la red. */
class ChatApiDoble {
  respuesta: Observable<ChatResponse> = of({
    reply: 'Tienes horarios libres el sábado.',
    history: [],
    degraded: false,
  });
  ultimoEnvio: { slug: string; message: string; history: unknown } | null = null;

  send(slug: string, message: string, history: unknown): Observable<ChatResponse> {
    this.ultimoEnvio = { slug, message, history };
    return this.respuesta;
  }
}

describe('ChatWidgetComponent', () => {
  let fixture: ComponentFixture<ChatWidgetComponent>;
  let api: ChatApiDoble;

  async function montar(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(ChatWidgetComponent);
    fixture.componentRef.setInput('slug', 'barberia-demo');
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

  async function abrirYEnviar(el: HTMLElement, texto: string): Promise<void> {
    click(el, '.chat-widget__toggle');
    await estabilizar();

    const input = el.querySelector('.chat-widget__form input') as HTMLInputElement;
    input.value = texto;
    input.dispatchEvent(new Event('input'));
    await estabilizar();

    click(el, '.chat-widget__send');
    await estabilizar();
  }

  beforeEach(async () => {
    api = new ChatApiDoble();

    await TestBed.configureTestingModule({
      imports: [ChatWidgetComponent],
      providers: [provideRouter([]), { provide: ChatApi, useValue: api }],
    }).compileComponents();
  });

  it('arranca cerrado, con un saludo inicial', async () => {
    const el = await montar();

    expect(el.querySelector('.chat-widget__panel')).toBeNull();
  });

  it('al abrir muestra el saludo, y al enviar manda el mensaje + historial previo', async () => {
    const el = await montar();
    api.respuesta = of({ reply: 'Claro, ¿qué servicio buscas?', history: [], degraded: false });

    await abrirYEnviar(el, 'quiero corte el sábado');

    expect(api.ultimoEnvio?.slug).toBe('barberia-demo');
    expect(api.ultimoEnvio?.message).toBe('quiero corte el sábado');
    // El saludo inicial va como historial previo al primer mensaje real.
    expect((api.ultimoEnvio?.history as { text: string }[])[0].text).toContain('Hola');
  });

  it('reemplaza los mensajes con el historial que devuelve el backend', async () => {
    const el = await montar();
    api.respuesta = of({
      reply: 'Tienes horarios libres el sábado a las 10 y a las 11.',
      history: [
        { role: 'user', text: 'quiero corte el sábado' },
        { role: 'model', text: 'Tienes horarios libres el sábado a las 10 y a las 11.' },
      ],
      degraded: false,
    });

    await abrirYEnviar(el, 'quiero corte el sábado');

    const burbujas = el.querySelectorAll('.chat-bubble');
    expect(burbujas.length).toBe(2);
    expect(burbujas[1].textContent).toContain('las 10 y a las 11');
  });

  it('si la respuesta viene degradada, ofrece el link al buscador manual', async () => {
    const el = await montar();
    api.respuesta = of({
      reply: 'No pudimos conectar con el asistente ahora mismo. Puedes buscar disponibilidad manualmente.',
      history: [{ role: 'model', text: 'No pudimos conectar…' }],
      degraded: true,
    });

    await abrirYEnviar(el, 'hola');

    const fallback = el.querySelector('.chat-widget__fallback');
    expect(fallback).not.toBeNull();
    expect(fallback?.getAttribute('href')).toContain('reservar');
  });

  it('si el HTTP falla, degrada igual en vez de reventar', async () => {
    const el = await montar();
    api.respuesta = throwError(() => new Error('network error')) as unknown as Observable<ChatResponse>;

    await abrirYEnviar(el, 'hola');

    expect(el.querySelector('.chat-widget__fallback')).not.toBeNull();
    expect(el.textContent).toContain('No pudimos conectar con el asistente');
  });
});
