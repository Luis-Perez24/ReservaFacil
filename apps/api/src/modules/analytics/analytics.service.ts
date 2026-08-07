import { BadRequestException, Injectable } from '@nestjs/common';
import type { DailyMetricResponse, ServiceMetricResponse } from '@reservafacil/contracts';
import { DataSource } from 'typeorm';

const DEFAULT_TOP_SERVICES_LIMIT = 5;

interface DailyMetricRow {
  date: string;
  reservations_count: number;
  revenue_clp: number;
  reserved_minutes: string;
  available_minutes: string;
  occupancy_rate: string | null;
  no_show_count: number;
  attendance_checked_count: number;
  no_show_rate: string | null;
}

interface ServiceMetricRow {
  service_id: string;
  service_name: string;
  reservations_count: number;
  revenue_clp: number;
}

function toDailyResponse(row: DailyMetricRow): DailyMetricResponse {
  return {
    date: row.date,
    reservationsCount: row.reservations_count,
    revenueClp: row.revenue_clp,
    reservedMinutes: Number(row.reserved_minutes),
    availableMinutes: Number(row.available_minutes),
    occupancyRate: row.occupancy_rate === null ? null : Number(row.occupancy_rate),
    noShowCount: row.no_show_count,
    attendanceCheckedCount: row.attendance_checked_count,
    noShowRate: row.no_show_rate === null ? null : Number(row.no_show_rate),
  };
}

function toServiceResponse(row: ServiceMetricRow): ServiceMetricResponse {
  return {
    serviceId: row.service_id,
    serviceName: row.service_name,
    reservationsCount: row.reservations_count,
    revenueClp: row.revenue_clp,
  };
}

/**
 * Lee `mv_tenant_daily_metrics`/`mv_tenant_service_metrics` (adr/0007) y
 * refresca ambas para el job periódico (`AnalyticsRefreshProcessor`). Sin
 * entidad TypeORM: no hay una tabla real detrás, así que se consulta con SQL
 * crudo vía `DataSource`, mismo patrón que `ReservationsService.expireStalePending`.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Devuelve la serie día a día tal cual está en la vista —con huecos en los
   * días sin actividad—, nunca un promedio ya calculado (adr/0008): quien
   * consuma esto y necesite un promedio debe usar el rango `from`/`to` como
   * denominador, no la cantidad de filas devueltas.
   */
  async getDaily(tenantId: string, from: string, to: string): Promise<DailyMetricResponse[]> {
    if (from > to) {
      throw new BadRequestException('"from" no puede ser posterior a "to"');
    }

    const rows: DailyMetricRow[] = await this.dataSource.query(
      `SELECT
         to_char(date, 'YYYY-MM-DD') AS date,
         reservations_count,
         revenue_clp,
         reserved_minutes,
         available_minutes,
         occupancy_rate,
         no_show_count,
         attendance_checked_count,
         no_show_rate
       FROM mv_tenant_daily_metrics
       WHERE tenant_id = $1 AND date BETWEEN $2 AND $3
       ORDER BY date ASC`,
      [tenantId, from, to],
    );

    return rows.map(toDailyResponse);
  }

  /** Ranking de servicios por ingresos. La vista no guarda el nombre (adr/0007), se hace join con `services`. */
  async getTopServices(
    tenantId: string,
    limit = DEFAULT_TOP_SERVICES_LIMIT,
  ): Promise<ServiceMetricResponse[]> {
    const rows: ServiceMetricRow[] = await this.dataSource.query(
      `SELECT
         vm.service_id,
         s.name AS service_name,
         vm.reservations_count,
         vm.revenue_clp
       FROM mv_tenant_service_metrics vm
       JOIN services s ON s.id = vm.service_id
       WHERE vm.tenant_id = $1
       ORDER BY vm.revenue_clp DESC
       LIMIT $2`,
      [tenantId, limit],
    );

    return rows.map(toServiceResponse);
  }

  /** Llamado por `AnalyticsRefreshProcessor`. `CONCURRENTLY` no bloquea lecturas mientras refresca (adr/0007). */
  async refresh(): Promise<void> {
    await this.dataSource.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_tenant_daily_metrics');
    await this.dataSource.query(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_tenant_service_metrics',
    );
  }
}
