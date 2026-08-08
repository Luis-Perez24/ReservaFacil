import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'reservafacil-dashboard-theme';

/**
 * Solo para el dashboard: el toggle vive en `dashboard-layout` y el signal
 * controla la clase `.dark` sobre ese mismo componente (ver `.dashboard.dark`
 * en `styles.scss`), nunca sobre `<html>` — así no hay forma de que el modo
 * oscuro se filtre a la página pública white-label de cada negocio.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly stored = localStorage.getItem(STORAGE_KEY) as 'dark' | 'light' | null;

  /** Sin preferencia guardada, sigue al sistema operativo. */
  readonly isDark = signal<boolean>(
    this.stored ? this.stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  toggle(): void {
    const next = !this.isDark();
    this.isDark.set(next);
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  }
}
