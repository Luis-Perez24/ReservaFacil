import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CreateReservationRequest,
  InitPaymentResponse,
  PublicAvailabilityResponse,
  PublicServiceResponse,
  PublicTenantResponse,
  ReservationResponse,
} from '@reservafacil/contracts';
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

  /** Slots libres de un servicio para un día, en fecha local del negocio. */
  findAvailability(
    slug: string,
    serviceId: string,
    date: string,
  ): Observable<PublicAvailabilityResponse> {
    return this.http.get<PublicAvailabilityResponse>(
      `/public/${encodeURIComponent(slug)}/availability`,
      { params: { serviceId, date } },
    );
  }

  createReservation(
    slug: string,
    body: CreateReservationRequest,
  ): Observable<ReservationResponse> {
    return this.http.post<ReservationResponse>(
      `/public/${encodeURIComponent(slug)}/reservations`,
      body,
    );
  }

  findReservation(slug: string, id: string): Observable<ReservationResponse> {
    return this.http.get<ReservationResponse>(
      `/public/${encodeURIComponent(slug)}/reservations/${encodeURIComponent(id)}`,
    );
  }

  /** Pide a Webpay la URL y el token; el navegador postea el token allá. */
  initPayment(slug: string, reservationId: string): Observable<InitPaymentResponse> {
    return this.http.post<InitPaymentResponse>(
      `/public/${encodeURIComponent(slug)}/reservations/${encodeURIComponent(reservationId)}/payments`,
      {},
    );
  }
}
