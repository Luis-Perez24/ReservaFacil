import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CreateServiceRequest, ServiceResponse, UpdateServiceRequest } from '@reservafacil/contracts';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ServicesApi {
  private readonly http = inject(HttpClient);

  findAll(): Observable<ServiceResponse[]> {
    return this.http.get<ServiceResponse[]>('/services');
  }

  create(dto: CreateServiceRequest): Observable<ServiceResponse> {
    return this.http.post<ServiceResponse>('/services', dto);
  }

  update(id: string, dto: UpdateServiceRequest): Observable<ServiceResponse> {
    return this.http.patch<ServiceResponse>(`/services/${id}`, dto);
  }

  /** Soft delete: el backend pone `active=false`, no borra la fila. Para reactivar, usar `update(id, { active: true })`. */
  deactivate(id: string): Observable<void> {
    return this.http.delete<void>(`/services/${id}`);
  }
}
