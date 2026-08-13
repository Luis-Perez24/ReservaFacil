# ADR 0007 — Vistas materializadas con refresh periódico

**Estado:** aceptada

## Contexto

El panel de métricas (día 10) necesita agregados por tenant: ocupación
diaria, ingresos, tasa de no-show, ranking de servicios. Esos números salen
de cruzar `reservations`, `payments`, `availability_rules`/
`availability_exceptions` y `tenants` — varias tablas grandes, con JOINs y
agregaciones por fecha.

Calcular esto al vuelo en cada `GET /analytics/...` recorrería
potencialmente toda la historia de reservas de un tenant en cada apertura
del dashboard, multiplicado por cada negocio que lo tenga abierto. El
dashboard no necesita el dato al segundo: un dueño de barbería revisando
"cómo me fue esta semana" no pierde nada si el número tiene unos minutos de
atraso.

## Decisión

Dos vistas materializadas (`mv_tenant_daily_metrics`,
`mv_tenant_service_metrics`), creadas en la migración
`AnalyticsMaterializedViews1785975538043`, con refresh periódico vía job
BullMQ (Parte 2, patrón calcado de
`ExpirationProcessor`/`expiration.queue.ts`: `upsertJobScheduler` con
intervalo propuesto de 5 minutos).

Cada vista lleva un índice único (`(tenant_id, date)` /
`(tenant_id, service_id)`) para poder usar `REFRESH MATERIALIZED VIEW
CONCURRENTLY`, que no bloquea lecturas mientras refresca — el dashboard
sigue sirviendo el dato anterior mientras se recalcula el nuevo.

## Alternativas descartadas

**Calcular todo al vuelo en el endpoint.** Sin capa intermedia: el request
corre las agregaciones directo contra `reservations`/`payments`. Es lo más
simple y siempre da el dato exacto al segundo, pero cada apertura del
dashboard paga el costo completo del agregado — y ese costo crece con la
historia del negocio, no con el tráfico del dashboard. Un negocio con dos
años de reservas paga el mismo costo por cada refresh de pantalla que uno
con una semana.

**Vista normal (no materializada) + cache en Redis.** Resuelve "no
recalcular en cada request" con una pieza que el proyecto ya tiene corriendo
(Redis, usado hoy para BullMQ). Se descartó porque agrega una segunda fuente
de verdad con su propia política de invalidación (¿TTL? ¿invalidar por
evento?), mientras que una vista materializada vive en la misma base, se
consulta con SQL normal, y "invalidar" es simplemente "refrescar" — no hay
dos sistemas que puedan desincronizarse entre sí.

**Tabla de agregados actualizada por trigger o por evento en cada
escritura.** Mantiene el dato siempre fresco, sin esperar a un job. Se
descartó por acoplamiento: cada INSERT/UPDATE relevante en `reservations` o
`payments` tendría que saber que existe una tabla de métricas y
actualizarla in place, mezclando código de negocio con una preocupación de
reporting. El refresh periódico separa completamente ambas cosas: la vista
no sabe nada de quién escribió, solo recalcula.

## Consecuencias

**A favor:** el dashboard siempre responde con una lectura indexada por
`tenant_id`, sin importar cuánta historia tenga el negocio. El costo de
agregación se paga una vez por refresh, no una vez por cada apertura de
pantalla.

**En contra:** el dato del dashboard puede estar hasta 5 minutos
desactualizado (el intervalo del refresh, Parte 2). Para un panel de
métricas de negocio esto es aceptable — nadie necesita ver un no-show
reflejado en el segundo exacto en que se marca.

**Riesgo asumido:** si el job de refresh falla silenciosamente (Parte 2 no
lo ha implementado aún), el dashboard sigue mostrando el último dato bueno
sin ninguna señal de que está atrasado. Mitigación pendiente para Parte 2:
alertar o exponer un timestamp de "última actualización" junto a los
números.
