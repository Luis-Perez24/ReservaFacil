import { Routes } from '@angular/router';

/**
 * La raíz del sitio es de cada negocio: `/barberia-demo` es su página pública.
 * El dashboard y el login llegan después bajo sus propios prefijos, así que el
 * slug queda como último patrón para no tapar rutas más específicas.
 */
export const routes: Routes = [
  {
    path: ':slug',
    loadComponent: () =>
      import('./features/public-booking/public-booking-page.component').then(
        (m) => m.PublicBookingPageComponent,
      ),
  },
];
