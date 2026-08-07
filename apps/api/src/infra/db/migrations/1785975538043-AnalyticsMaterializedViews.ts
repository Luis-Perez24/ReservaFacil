import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vistas materializadas del panel de métricas (día 10). No se calculan al
 * vuelo en cada request: agregan `reservations`/`payments`/`availability_*`
 * de todos los tenants, y recalcular eso por cada `GET` sería caro. Se
 * refrescan con un job periódico (`analytics`, parte 2 del día).
 *
 * Cada `GROUP BY` incluye `tenant_id` explícitamente — el riesgo real de
 * este día es justo un `GROUP BY` que mezcle negocios.
 *
 * `mv_tenant_daily_metrics` solo cubre días con al menos una reserva `PAID`
 * o `CONFIRMED`: no genera un calendario completo con días vacíos.
 */
export class AnalyticsMaterializedViews1785975538043 implements MigrationInterface {
  name = 'AnalyticsMaterializedViews1785975538043';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Un "día" es el día calendario en la zona horaria del tenant (mismo
    // criterio que el cálculo de slots), no el día UTC de `starts_at`.
    // `revenue_clp` sale de `payments APPROVED`, no del estado de la
    // reserva: una CONFIRMED que luego se cancela sigue siendo plata que
    // entró (sin reembolso automático, `adr/0006`).
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW "mv_tenant_daily_metrics" AS
        WITH active_reservations AS (
          SELECT
            r.tenant_id,
            (r.starts_at AT TIME ZONE t.timezone)::date AS date,
            r.attended,
            EXTRACT(EPOCH FROM (r.ends_at - r.starts_at))::numeric / 60 AS duration_min
          FROM "reservations" r
          JOIN "tenants" t ON t.id = r.tenant_id
          WHERE r.status IN ('PAID', 'CONFIRMED')
        ),
        daily_reserved AS (
          SELECT
            tenant_id,
            date,
            COUNT(*)::int AS reservations_count,
            SUM(duration_min) AS reserved_minutes,
            COUNT(*) FILTER (WHERE attended = false)::int AS no_show_count,
            COUNT(*) FILTER (WHERE attended IS NOT NULL)::int AS attendance_checked_count
          FROM active_reservations
          GROUP BY tenant_id, date
        ),
        daily_revenue AS (
          SELECT
            r.tenant_id,
            (r.starts_at AT TIME ZONE t.timezone)::date AS date,
            SUM(p.amount_clp)::int AS revenue_clp
          FROM "payments" p
          JOIN "reservations" r ON r.id = p.reservation_id
          JOIN "tenants" t ON t.id = r.tenant_id
          WHERE p.status = 'APPROVED'
          GROUP BY r.tenant_id, (r.starts_at AT TIME ZONE t.timezone)::date
        ),
        -- Minutos que el negocio tiene abiertos ese día: la excepción manda
        -- sobre la regla semanal (03-modelo-datos.md), igual que en catalog.
        daily_available AS (
          SELECT
            dr.tenant_id,
            dr.date,
            COALESCE(
              (
                SELECT CASE WHEN e.closed THEN 0
                             ELSE EXTRACT(EPOCH FROM (e.end_time - e.start_time))::numeric / 60 END
                FROM "availability_exceptions" e
                WHERE e.tenant_id = dr.tenant_id AND e.date = dr.date
              ),
              (
                SELECT SUM(EXTRACT(EPOCH FROM (ar.end_time - ar.start_time))::numeric / 60)
                FROM "availability_rules" ar
                WHERE ar.tenant_id = dr.tenant_id
                  AND ar.day_of_week = EXTRACT(DOW FROM dr.date)::smallint
              ),
              0
            ) AS available_minutes
          FROM daily_reserved dr
        )
        SELECT
          dr.tenant_id,
          dr.date,
          dr.reservations_count,
          COALESCE(rev.revenue_clp, 0) AS revenue_clp,
          dr.reserved_minutes,
          av.available_minutes,
          CASE WHEN av.available_minutes > 0
               THEN ROUND(dr.reserved_minutes / av.available_minutes, 4)
               ELSE NULL END AS occupancy_rate,
          dr.no_show_count,
          dr.attendance_checked_count,
          CASE WHEN dr.attendance_checked_count > 0
               THEN ROUND(dr.no_show_count::numeric / dr.attendance_checked_count, 4)
               ELSE NULL END AS no_show_rate
        FROM daily_reserved dr
        LEFT JOIN daily_revenue rev ON rev.tenant_id = dr.tenant_id AND rev.date = dr.date
        JOIN daily_available av ON av.tenant_id = dr.tenant_id AND av.date = dr.date
    `);
    // Índice único: lo exige `REFRESH MATERIALIZED VIEW CONCURRENTLY` (parte 2).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_mv_tenant_daily_metrics" ON "mv_tenant_daily_metrics" ("tenant_id", "date")`,
    );

    // Totales históricos por servicio: alimenta el ranking "top servicios".
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW "mv_tenant_service_metrics" AS
        SELECT
          r.tenant_id,
          r.service_id,
          COUNT(*)::int AS reservations_count,
          COALESCE(SUM(p.amount_clp), 0)::int AS revenue_clp
        FROM "reservations" r
        LEFT JOIN "payments" p ON p.reservation_id = r.id AND p.status = 'APPROVED'
        WHERE r.status IN ('PAID', 'CONFIRMED')
        GROUP BY r.tenant_id, r.service_id
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_mv_tenant_service_metrics" ON "mv_tenant_service_metrics" ("tenant_id", "service_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW "mv_tenant_service_metrics"`);
    await queryRunner.query(`DROP MATERIALIZED VIEW "mv_tenant_daily_metrics"`);
  }
}
