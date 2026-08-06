import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { DailyMetricResponse, ServiceMetricResponse } from '@reservafacil/contracts';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  private readonly http = inject(HttpClient);

  findDaily(from: string, to: string): Observable<DailyMetricResponse[]> {
    return this.http.get<DailyMetricResponse[]>('/analytics/daily', { params: { from, to } });
  }

  findTopServices(limit = 5): Observable<ServiceMetricResponse[]> {
    return this.http.get<ServiceMetricResponse[]>('/analytics/services/top', {
      params: { limit },
    });
  }
}
