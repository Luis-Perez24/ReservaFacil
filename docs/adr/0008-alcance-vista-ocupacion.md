# ADR 0008 — Alcance de `mv_tenant_daily_metrics`: solo días con actividad

**Estado:** aceptada

## Contexto

`mv_tenant_daily_metrics` (ADR 0007) agrega, por tenant y por fecha, minutos
reservados, minutos disponibles, ingresos y asistencia. La pregunta de
diseño: ¿qué fechas aparecen como filas? La opción evidente —un calendario
completo, un renglón por cada día que el negocio existe— no es gratis:
obliga a decidir desde cuándo un negocio "cuenta" como operando (¿desde que
se registró? ¿desde su primera regla de disponibilidad?), y crece para
siempre en cada refresh, la mayoría de esas filas quietas en cero.

Se optó por la alternativa más simple: la vista solo tiene una fila por día
que tuvo al menos una reserva `PAID` o `CONFIRMED`. Los días sin ninguna
reserva simplemente no aparecen.

Esa simplificación tiene un costo real: si en Parte 2 alguien promedia
`occupancy_rate` con un `AVG()` directo sobre un rango de fechas, el
promedio queda inflado — los días sin actividad, que deberían contar como
0% de ocupación, no participan ni en la suma ni en el conteo. Es el mismo
error que promediar las notas de un curso ignorando a quienes sacaron 0.

## Decisión

La vista mantiene el alcance reducido (solo días con actividad). El sesgo
se corrige **en el punto de consumo, no en la vista**: ningún endpoint de
Parte 2 hace `AVG(occupancy_rate)` directo sobre un rango de fechas. En su
lugar:

- El endpoint de series (`GET /analytics/daily?from=&to=`) devuelve las
  filas tal cual están —día a día, con huecos— para que el frontend
  grafique la serie real, sin promediar en el backend.
- Si en algún momento se necesita un promedio de ocupación sobre un rango,
  se calcula con el **denominador correcto**: días totales del rango
  (`to - from`), no la cantidad de filas devueltas por la vista. Los días
  sin fila cuentan como 0 minutos reservados en ese cálculo.

## Alternativas descartadas

**Generar el calendario completo con `generate_series`, `LEFT JOIN` y
`occupancy_rate = 0` en días vacíos.** Resuelve el sesgo en el origen —
nadie podría usar mal la vista después. Se descartó por dos razones.
Primero, no elimina la ambigüedad, la traslada: sigue habiendo que decidir
desde cuándo generar el calendario para cada tenant, y esa fecha no existe
limpia en el modelo hoy — un negocio registrado hace dos años pero operando
hace tres meses generaría ceros artificiales igual de engañosos, ahora
hacia abajo en vez de hacia arriba. Segundo, cada refresh (cada 5 minutos,
ADR 0007) recalcularía una fila por día desde el origen del tenant para
siempre, en su mayoría ceros que nunca cambian — exactamente el costo
permanente que la vista materializada existe para evitar.

**Agregar una columna de metadata (días totales del rango vs. días con
actividad) junto a los agregados existentes.** Punto medio que hace el
sesgo visible sin cambiar el modelo. Se descartó porque "días totales del
rango" no es una propiedad de una fila individual: depende del rango que
pregunte quien consulta, algo que la vista no conoce. Terminaría siendo una
columna calculada en el momento de la consulta de todos modos — que es
exactamente donde ya se resuelve con la regla de consumo elegida.

## Consecuencias

**A favor:** la vista se mantiene simple y barata de refrescar. El rango de
fechas ya lo controla quien consulta (`from`/`to` del endpoint), así que
ahí —y solo ahí— se conoce el denominador correcto, sin inventar una fecha
de inicio para el tenant.

**En contra:** la corrección del sesgo depende de disciplina en el código
que consume la vista, no de una garantía estructural de la base de datos.
Un query nuevo escrito sin conocer este ADR puede reintroducir el promedio
inflado.

**Riesgo asumido:** se acepta explícitamente porque quien escriba el
endpoint de Parte 2 (delegado como `[oc]`, ver `.private/05-plan.md`) tiene
que conocer esta regla antes de tocar `mv_tenant_daily_metrics`. Mitigación:
el test obligatorio de aislamiento por tenant de Parte 2 se extiende con un
caso que verifique el promedio sobre un rango con al menos un día vacío —
no solo que cada tenant vea únicamente lo suyo.
