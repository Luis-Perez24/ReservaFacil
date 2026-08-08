import { Injectable, signal } from '@angular/core';

const VISIBLE_MS = 3500;
/** Debe calzar con la duración de la transición de `.toast` en toast.component.scss. */
const LEAVE_MS = 220;

/**
 * Un solo toast a la vez, cualquier página del dashboard puede pedirlo. El
 * signal `leaving` existe solo para la animación de salida: `@if` en el
 * template no anima la remoción del DOM por su cuenta, así que primero se
 * marca "saliendo" (dispara la transición CSS) y recién después de que esa
 * transición termina se borra el mensaje de verdad.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  readonly leaving = signal(false);

  private visibleTimer: ReturnType<typeof setTimeout> | null = null;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;

  show(message: string): void {
    if (this.visibleTimer) {
      clearTimeout(this.visibleTimer);
    }
    if (this.leaveTimer) {
      clearTimeout(this.leaveTimer);
    }

    this.leaving.set(false);
    this.message.set(message);
    this.visibleTimer = setTimeout(() => this.hide(), VISIBLE_MS);
  }

  private hide(): void {
    this.leaving.set(true);
    this.leaveTimer = setTimeout(() => {
      this.message.set(null);
      this.leaving.set(false);
    }, LEAVE_MS);
  }
}
