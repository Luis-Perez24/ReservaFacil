import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { AuthTokens, AuthenticatedUser, LoginRequest, LoginResponse } from '@reservafacil/contracts';
import { Observable, finalize, shareReplay, tap } from 'rxjs';

const STORAGE_KEY = 'reservafacil.auth';

interface StoredAuth {
  tokens: AuthTokens;
  user: AuthenticatedUser;
}

function readStorage(): StoredAuth | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

/**
 * Único dueño del estado de sesión del dashboard: login, tokens y el usuario
 * autenticado viven acá (no en un `Api` sin estado, como `PublicBookingApi`)
 * porque tres consumidores distintos —el guard de rutas, el interceptor HTTP
 * y las páginas del dashboard— necesitan ver exactamente el mismo estado.
 *
 * Los tokens se guardan en `localStorage`: la API de refresh los recibe en el
 * body (`RefreshRequest`), no por cookie httpOnly, así que no hay otra forma
 * de persistirlos entre recargas sin volver a pedir credenciales.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly stored = signal<StoredAuth | null>(readStorage());

  readonly user = computed(() => this.stored()?.user ?? null);
  readonly isAuthenticated = computed(() => this.stored() !== null);

  /** Refresh en curso, compartido entre requests concurrentes que reciben 401 a la vez. */
  private refreshInFlight$: Observable<AuthTokens> | null = null;

  get accessToken(): string | null {
    return this.stored()?.tokens.accessToken ?? null;
  }

  get refreshToken(): string | null {
    return this.stored()?.tokens.refreshToken ?? null;
  }

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/auth/login', request).pipe(
      tap((response) => this.persist(response.user, response.tokens)),
    );
  }

  logout(): void {
    this.stored.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  /** Llamado solo por el interceptor ante un 401. Deduplica refrescos simultáneos. */
  refresh(): Observable<AuthTokens> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    const refreshToken = this.refreshToken;
    if (!refreshToken) {
      throw new Error('No hay sesión que refrescar');
    }

    this.refreshInFlight$ = this.http.post<AuthTokens>('/auth/refresh', { refreshToken }).pipe(
      tap((tokens) => {
        const user = this.stored()?.user;
        if (user) {
          this.persist(user, tokens);
        }
      }),
      finalize(() => {
        this.refreshInFlight$ = null;
      }),
      shareReplay(1),
    );

    return this.refreshInFlight$;
  }

  private persist(user: AuthenticatedUser, tokens: AuthTokens): void {
    const value: StoredAuth = { user, tokens };
    this.stored.set(value);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }
}
