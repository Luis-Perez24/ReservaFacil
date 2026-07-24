import { Routes } from '@angular/router';

/**
 * La raíz del sitio es de cada negocio: `/barberia-demo` es su página pública.
 *
 * El orden importa: `:slug` matchea cualquier cosa, así que las rutas fijas van
 * antes o quedarían tapadas —`/pago/anulado` se leería como el negocio "pago".
 */
export const routes: Routes = [
  {
    path: 'pago/anulado',
    loadComponent: () =>
      import('./features/public-booking/payment-cancelled-page.component').then(
        (m) => m.PaymentCancelledPageComponent,
      ),
  },
  {
    path: ':slug/reserva/:id',
    loadComponent: () =>
      import('./features/public-booking/reservation-page.component').then(
        (m) => m.ReservationPageComponent,
      ),
  },
  {
    path: ':slug',
    loadComponent: () =>
      import('./features/public-booking/public-booking-page.component').then(
        (m) => m.PublicBookingPageComponent,
      ),
  },
];
