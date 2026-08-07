import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AvailabilityExceptionResponse,
  AvailabilityRuleResponse,
  CreateAvailabilityExceptionRequest,
  CreateAvailabilityRuleRequest,
} from '@reservafacil/contracts';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AvailabilityApi {
  private readonly http = inject(HttpClient);

  findRules(): Observable<AvailabilityRuleResponse[]> {
    return this.http.get<AvailabilityRuleResponse[]>('/availability/rules');
  }

  createRule(dto: CreateAvailabilityRuleRequest): Observable<AvailabilityRuleResponse> {
    return this.http.post<AvailabilityRuleResponse>('/availability/rules', dto);
  }

  deleteRule(id: string): Observable<void> {
    return this.http.delete<void>(`/availability/rules/${id}`);
  }

  findExceptions(): Observable<AvailabilityExceptionResponse[]> {
    return this.http.get<AvailabilityExceptionResponse[]>('/availability/exceptions');
  }

  createException(dto: CreateAvailabilityExceptionRequest): Observable<AvailabilityExceptionResponse> {
    return this.http.post<AvailabilityExceptionResponse>('/availability/exceptions', dto);
  }

  deleteException(id: string): Observable<void> {
    return this.http.delete<void>(`/availability/exceptions/${id}`);
  }
}
