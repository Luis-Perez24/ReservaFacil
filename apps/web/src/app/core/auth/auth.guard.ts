import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { inject } from '@angular/core';

import { AuthService } from './auth.service';

/** Protege `/dashboard`: sin sesión, redirige al login en vez de dejar pasar. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.parseUrl('/dashboard/login');
};
