import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Solo los campos que el dashboard necesita mostrar. `GET /tenants/me` en el
 * backend devuelve la entidad completa (incluye `branding` con más campos
 * pensados para la página pública), pero acá no hace falta tiparla entera.
 */
export interface TenantSelf {
  id: string;
  name: string;
  slug: string;
  branding: { primaryColor: string | null } | null;
}

@Injectable({ providedIn: 'root' })
export class TenantApi {
  private readonly http = inject(HttpClient);

  /** El negocio sale del token: no hay parámetro, el backend resuelve el tenant del JWT. */
  findMine(): Observable<TenantSelf> {
    return this.http.get<TenantSelf>('/tenants/me');
  }
}
