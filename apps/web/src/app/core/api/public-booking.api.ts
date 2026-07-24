import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { PublicServiceResponse, PublicTenantResponse } from '@reservafacil/contracts';
import { Observable } from 'rxjs';

/**
 * Lo que la página pública puede pedirle a la API. Las rutas son relativas: en
 * desarrollo las redirige `proxy.conf.json` y en producción el front y la API
 * viven detrás del mismo dominio, así que el código no cambia.
 *
 * Los tipos salen de `@reservafacil/contracts`: si la API cambia una respuesta,
 * esto deja de compilar, que es exactamente lo que se quiere.
 */
@Injectable({ providedIn: 'root' })
export class PublicBookingApi {
  private readonly http = inject(HttpClient);

  findTenant(slug: string): Observable<PublicTenantResponse> {
    return this.http.get<PublicTenantResponse>(`/public/${encodeURIComponent(slug)}`);
  }

  findServices(slug: string): Observable<PublicServiceResponse[]> {
    return this.http.get<PublicServiceResponse[]>(
      `/public/${encodeURIComponent(slug)}/services`,
    );
  }
}
