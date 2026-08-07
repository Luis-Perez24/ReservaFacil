import type { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from './auth.service';

/** `/auth/refresh` con un token vencido también devuelve 401: no reintentar ese, o queda en loop. */
function isRefreshCall(request: HttpRequest<unknown>): boolean {
  return request.url.includes('/auth/refresh');
}

/**
 * Adjunta el access token a toda request saliente (las públicas no lo usan,
 * así que no hace daño mandarlo igual) y, ante un 401, intenta un refresh una
 * sola vez antes de propagar el error. Si el refresh también falla, cierra la
 * sesión — el guard se encarga de mandar de vuelta al login en la próxima
 * navegación.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.accessToken;
  const authorized = token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(authorized).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isRefreshCall(request) || !auth.refreshToken) {
        return throwError(() => error);
      }

      return auth.refresh().pipe(
        switchMap((tokens) =>
          next(request.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } })),
        ),
        catchError((refreshError: unknown) => {
          auth.logout();
          void router.navigateByUrl('/dashboard/login');
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
