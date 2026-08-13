# ADR 0002 — Locking pesimista para reservas

**Estado:** aceptada

## Contexto

La invariante que define el producto: **nunca dos reservas activas que se
solapen para el mismo tenant y servicio**. La contención es alta y localizada
— cuando un negocio abre la agenda del sábado, muchos clientes van al mismo
slot popular al mismo tiempo. Una doble reserva no es un bug menor: es el
dolor #1 que el producto promete resolver.

## Decisión

**Transacción + `SELECT … FOR UPDATE`** sobre las reservas que se solapan con
el rango pedido, antes de insertar.

Cuatro capas de defensa:

1. **Lock sobre la fila del servicio** (`FOR UPDATE`) — serializa las reservas
   de ese servicio. Ver "Inserciones fantasma" más abajo.
2. **Lock pesimista sobre las reservas que se solapan** (`FOR UPDATE`) — la
   lógica.
3. **Índice único parcial** sobre estados activos — la red de seguridad a
   nivel BD, por si la lógica falla.
4. **Chequeo de expiración dentro del lock** — un `PENDING` con
   `expires_at < now()` se trata como **libre**.

```sql
-- 1. Serializa las reservas de este servicio.
SELECT id FROM services WHERE id = :s AND tenant_id = :t FOR UPDATE;

-- 2. Ya sin concurrencia sobre el servicio, el chequeo de rango es autoritativo.
SELECT … FROM reservations
 WHERE tenant_id = :t AND service_id = :s
   AND tstzrange(starts_at, ends_at) && tstzrange(:from, :to)
   AND ( status IN ('PAID','CONFIRMED')
         OR (status = 'PENDING' AND expires_at > now()) )
 FOR UPDATE;
```

### Inserciones fantasma: por qué se bloquea también el servicio

`SELECT … FOR UPDATE` bloquea **filas que ya existen**. Cuando dos clientes
reservan al mismo tiempo un horario que todavía no tiene ninguna reserva, el
`SELECT` no encuentra nada que bloquear en ninguna de las dos transacciones:
ambas pasan el chequeo y ambas insertan.

Para dos reservas al **mismo `starts_at`**, el índice único parcial atrapa la
segunda. Pero para un **solapamiento parcial** —10:00 corte de 60 min contra
10:30 barba de 30 min, distinto `starts_at`— el índice no aplica y quedarían dos
reservas pisándose.

El solapamiento se define a nivel de `(tenant, servicio)`, así que se bloquea la
fila del servicio al abrir la transacción. Eso serializa las inserciones de ese
servicio: la segunda transacción espera, y cuando entra ya ve la reserva que
insertó la primera. La contención resultante —un servicio a la vez— coincide con
el patrón real de carga: la disputa siempre es por la agenda de un mismo
servicio.

### Expiración perezosa del hold vencido

El predicado del índice único no puede mirar `expires_at`, porque un índice
parcial exige funciones `IMMUTABLE` y `now()` no lo es. Por eso el índice cuenta
como ocupado cualquier `PENDING`, incluso uno vencido.

Sin corregirlo, la regla "un `PENDING` expirado deja el slot libre" fallaría en
su caso más común: el cliente A no paga, y el cliente B intenta el mismo horario
pero choca contra el índice. Para evitarlo, ya con el servicio bloqueado, las
reservas `PENDING` vencidas que se solapan pasan a `EXPIRED` antes de insertar.
Converge al mismo estado que el job de expiración (`día 9`) y es idempotente.

## Alternativas descartadas

**Optimista (versión + reintento).** El locking optimista rinde cuando los
conflictos son raros: se asume que no chocan y se reintenta el que perdió.
Acá los conflictos son **el caso esperado**, no la excepción. Con alta
contención el optimista degenera en una tormenta de reintentos.

**Constraint único a secas, sin lock.** Funcionaría para slots idénticos,
pero no cubre solapamiento parcial (10:00 corte de 60min vs 10:30 barba de
30min: distinto `starts_at`, mismo conflicto). Además convierte una regla de
negocio en un error de BD que hay que traducir a 409 atrapando el código de
excepción de Postgres. El índice se mantiene igual, pero como red, no como
lógica.

**Serializable isolation.** Postgres lo soporta, pero mueve el problema:
transacciones abortadas que igual hay que reintentar, con peor rendimiento
global. Bloquear la fila exacta es más quirúrgico.

## Consecuencias

**A favor:** correcto por construcción bajo cualquier concurrencia. El lock
es corto (milisegundos) y solo sobre las filas del slot en disputa, no sobre
la tabla. Devuelve un `409` limpio.

**En contra:** el lock pesimista serializa el acceso a ese slot. Si el mismo
slot recibiera miles de requests por segundo, sería un cuello de botella. No
es el perfil de carga de una pyme de servicios, y esa es justamente la razón
de que sea aceptable: **la decisión depende del patrón de carga, no de una
preferencia**.

**Riesgo asumido:** un `FOR UPDATE` mal escrito puede escalar a más filas de
las necesarias. El test de concurrencia existe para detectarlo.

## Prueba de carga

k6, 100 requests concurrentes al mismo slot:

| Métrica | Resultado |
|---|---|
| `201 Created` | 1 |
| `409 Conflict` | 99 |
| **Dobles reservas** | 0 |
| p95 latencia | 562 ms |

Verificado también contra la base: tras la corrida queda exactamente una fila
activa (`PENDING`/`PAID`/`CONFIRMED`) para el slot disputado — el conteo de
`201`/`409` no es la única fuente, la tabla lo confirma.
