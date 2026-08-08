import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Calendar,
  CalendarDays,
  CalendarOff,
  CircleCheck,
  Clock,
  LogOut,
  LucideAngularModule,
  Moon,
  Star,
  Sun,
  TrendingUp,
} from 'lucide-angular';

import { authInterceptor } from './core/auth/auth.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // `withComponentInputBinding` deja que `:slug` llegue como input del
    // componente, en vez de tener que leer el ActivatedRoute a mano.
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // `.pick()` devuelve un `ModuleWithProviders` (patrón `forRoot`): en una
    // app standalone eso va en los providers de arranque, no en el `imports`
    // de un componente —ahí solo se aceptan componentes/directivas/pipes o
    // NgModules planos—. Un solo lugar con todos los íconos que usa el
    // dashboard, en vez de repetir `.pick()` por componente.
    importProvidersFrom(
      LucideAngularModule.pick({
        Activity,
        ArrowUpRight,
        BarChart3,
        Briefcase,
        Calendar,
        CalendarDays,
        CalendarOff,
        CircleCheck,
        Clock,
        LogOut,
        Moon,
        Star,
        Sun,
        TrendingUp,
      }),
    ),
  ],
};
