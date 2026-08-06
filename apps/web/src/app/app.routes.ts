import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';

/**
 * La raíz del sitio es de cada negocio: `/barberia-demo` es su página pública, y
 * `/barberia-demo/reservar` el flujo de reserva, separado para que quien viene a
 * reservar no tenga alrededor el resto de la página.
 *
 * El orden importa: `:slug` matchea cualquier cosa, así que las rutas fijas y las
 * más específicas van antes o quedarían tapadas —`/pago/anulado` se leería como
 * el negocio "pago", `/dashboard` como el negocio "dashboard", y `/x/reservar`
 * como el negocio "x" a secas.
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
    path: 'dashboard/login',
    loadComponent: () =>
      import('./features/dashboard/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard-layout.component').then(
        (m) => m.DashboardLayoutComponent,
      ),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/dashboard/analytics-page.component').then(
            (m) => m.AnalyticsPageComponent,
          ),
      },
    ],
  },
  {
    path: ':slug/reserva/:id',
    loadComponent: () =>
      import('./features/public-booking/reservation-page.component').then(
        (m) => m.ReservationPageComponent,
      ),
  },
  {
    path: ':slug/reservar',
    loadComponent: () =>
      import('./features/public-booking/booking-page.component').then((m) => m.BookingPageComponent),
  },
  {
    path: ':slug',
    loadComponent: () =>
      import('./features/public-booking/business-landing.component').then(
        (m) => m.BusinessLandingComponent,
      ),
  },
];
