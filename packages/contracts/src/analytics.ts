/** Fila de `mv_tenant_daily_metrics` (adr/0007, adr/0008), un día calendario del negocio. */
export interface DailyMetricResponse {
  /** YYYY-MM-DD, día calendario en la zona horaria del tenant. */
  date: string;
  reservationsCount: number;
  revenueClp: number;
  reservedMinutes: number;
  availableMinutes: number;
  /** `null` si `availableMinutes` es 0 (no dividir por cero). */
  occupancyRate: number | null;
  noShowCount: number;
  attendanceCheckedCount: number;
  /** `null` si todavía no se ha marcado ninguna asistencia ese día. */
  noShowRate: number | null;
}

/** Fila de `mv_tenant_service_metrics`, para el ranking "top servicios". */
export interface ServiceMetricResponse {
  serviceId: string;
  serviceName: string;
  reservationsCount: number;
  revenueClp: number;
}
