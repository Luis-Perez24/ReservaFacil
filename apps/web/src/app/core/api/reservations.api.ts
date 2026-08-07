import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  MarkAttendanceRequest,
  ReservationAgendaResponse,
  ReservationResponse,
} from '@reservafacil/contracts';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ReservationsApi {
  private readonly http = inject(HttpClient);

  findAgenda(from: string, to: string): Observable<ReservationAgendaResponse[]> {
    return this.http.get<ReservationAgendaResponse[]>('/reservations', { params: { from, to } });
  }

  markAttendance(id: string, attended: boolean): Observable<ReservationResponse> {
    return this.http.patch<ReservationResponse>(`/reservations/${id}/attendance`, {
      attended,
    } satisfies MarkAttendanceRequest);
  }
}
