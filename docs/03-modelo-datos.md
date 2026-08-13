# Modelo de datos

> **Este documento manda sobre el código.** Si una entidad TypeORM no calza
> con lo de acá, la entidad está mal. El esquema es la decisión más cara de
> revertir del sistema: `tenant_id` y la máquina de estados se definen antes
> de la primera línea de código y no se improvisan después.

Convenciones: `snake_case` en BD, `camelCase` en TypeScript. PKs `uuid`
(`gen_random_uuid()`). Todo timestamp es `timestamptz` en UTC — la conversión
a hora local usa `tenants.timezone`. Toda tabla de negocio lleva
`created_at` / `updated_at`.

---

## Regla transversal: tenant_id

Toda tabla de negocio lleva `tenant_id NOT NULL` con FK a `tenants`.
Toda query lleva filtro por `tenant_id`. Sin excepciones.

- El `TenantGuard` extrae el tenant del JWT (dashboard) o del slug de la URL
  (página pública) y lo inyecta en el request context.
- Ningún repositorio expone un método que no reciba `tenant_id`.
- Todo índice de búsqueda parte por `tenant_id`.
- Pendiente de evaluación (`adr/0006`): Row-Level Security como segunda
  barrera a nivel BD.

Única tabla exenta: `users` con rol `CLIENT`, que puede no tener tenant
(un cliente puede reservar en varios negocios).

---

## tenants

El negocio. Raíz de todo el aislamiento.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | "Barbería Don Lucho" |
| `slug` | text NOT NULL **UNIQUE** | URL pública: `/reserva/don-lucho` |
| `timezone` | text NOT NULL | default `'America/Santiago'` |
| `branding` | jsonb | logo_url, color primario |
| `active` | boolean NOT NULL | default `true` |

- `slug` es único **global** (no por tenant): es la URL pública.
- Índice: `UNIQUE (slug)`.

## users

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NULL | NULL solo para rol `CLIENT` |
| `email` | text NOT NULL | |
| `password_hash` | text NOT NULL | bcrypt/argon2 |
| `full_name` | text NOT NULL | |
| `phone` | text | |
| `role` | enum NOT NULL | `OWNER` \| `STAFF` \| `CLIENT` |
| `active` | boolean NOT NULL | default `true` |

- Índice: `UNIQUE (tenant_id, email)` — el mismo email puede ser cliente de
  dos negocios distintos.
- `OWNER`/`STAFF` siempre tienen `tenant_id`. Validar en aplicación.
- **PII.** Nunca sale hacia Gemini (`adr/0004`).

## services

Catálogo del negocio: qué vende y cuánto dura.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `name` | text NOT NULL | "Corte + barba" |
| `duration_min` | int NOT NULL | `CHECK (duration_min > 0)` |
| `price_clp` | int NOT NULL | **CLP entero, nunca decimal** |
| `active` | boolean NOT NULL | default `true` |

- `price_clp` es entero: el peso chileno no tiene decimales y Webpay recibe
  enteros. Usar `numeric`/`float` para plata es un bug esperando ocurrir.
- Índice: `(tenant_id, active)`.

## availability_rules

Reglas de horario semanal del negocio. **No se guardan slots**: se calculan.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `day_of_week` | smallint NOT NULL | 0=domingo … 6=sábado |
| `start_time` | time NOT NULL | `09:00` |
| `end_time` | time NOT NULL | `18:00`, `CHECK (end_time > start_time)` |
| `slot_interval_min` | int NOT NULL | granularidad de la grilla, ej. 30 |

- Índice: `(tenant_id, day_of_week)`.

## availability_exceptions

Feriados, vacaciones, un sábado cerrado.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `date` | date NOT NULL | |
| `closed` | boolean NOT NULL | `true` = cerrado todo el día |
| `start_time` | time NULL | horario especial si `closed = false` |
| `end_time` | time NULL | |

- Índice: `UNIQUE (tenant_id, date)`.

> **Decisión: slots calculados, no materializados.** Las reglas generan la
> grilla en memoria y se restan las reservas activas. No hay tabla `slots`
> con millones de filas futuras que mantener. El lock va sobre
> `reservations`, no sobre un slot que no existe como fila (ver `adr/0002`).

## reservations

**El núcleo.** Acá vive la invariante que defiende todo el proyecto.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `service_id` | uuid NOT NULL | FK services |
| `client_id` | uuid NOT NULL | FK users (rol CLIENT) |
| `starts_at` | timestamptz NOT NULL | inicio del slot |
| `ends_at` | timestamptz NOT NULL | `starts_at + duration_min` |
| `status` | enum NOT NULL | ver máquina de estados |
| `expires_at` | timestamptz NULL | solo si `PENDING`. `now() + 10 min` |
| `price_clp` | int NOT NULL | **copiado del servicio al reservar** |
| `attended` | boolean NULL | no-show tracking (analytics) |
| `cancelled_reason` | text NULL | |

- `price_clp` se **copia**, no se referencia: si el negocio sube el precio
  mañana, la reserva de ayer mantiene lo que el cliente pagó.
- `ends_at` se calcula al crear y se guarda: evita recalcular la duración
  del servicio en cada query de solapamiento.

### Máquina de estados

```
              ┌──────────► EXPIRED      (no pagó en 10 min, job libera slot)
              │
   PENDING ───┼──────────► CANCELLED    (cliente o negocio cancela)
              │
              └─► PAID ──► CONFIRMED    (Webpay confirmó)
                              │
                              └────────► CANCELLED
```

Estados **activos** (ocupan el slot): `PENDING` (no expirado), `PAID`,
`CONFIRMED`.
Estados **muertos** (liberan el slot): `EXPIRED`, `CANCELLED`.

Transiciones válidas — cualquier otra es un bug, no un caso de negocio:

| Desde | Hacia | Quién |
|---|---|---|
| `PENDING` | `PAID` | webhook/retorno Webpay aprobado |
| `PENDING` | `EXPIRED` | job de expiración (`expires_at < now()`) |
| `PENDING` | `CANCELLED` | cliente/negocio |
| `PAID` | `CONFIRMED` | sistema, tras commit exitoso |
| `CONFIRMED` | `CANCELLED` | cliente/negocio |

`PAID` y `CONFIRMED` están separados a propósito: `PAID` es "Webpay dijo que
sí", `CONFIRMED` es "la reserva quedó firme y ya cancelé el job de
expiración". Si algo revienta entre medio, el estado dice exactamente dónde.

### Invariante (la regla que define el proyecto)

> **Nunca dos reservas en estado activo que se solapen en el tiempo para el
> mismo tenant y servicio.**

Se defiende en **tres capas**:

1. **Transacción + `SELECT … FOR UPDATE`** al crear (`adr/0002`).
2. **Índice único parcial** — la red de seguridad a nivel BD:
   ```sql
   CREATE UNIQUE INDEX uq_reservation_active_slot
     ON reservations (tenant_id, service_id, starts_at)
     WHERE status IN ('PENDING','PAID','CONFIRMED');
   ```
3. **Chequeo de expiración en el lock**: un `PENDING` con
   `expires_at < now()` se trata como **libre**. Sin esto, un slot abandonado
   quedaría bloqueado 10 minutos aunque nadie vaya a pagarlo.

> ⚠️ El índice único cubre slots con el **mismo `starts_at`**. Servicios de
> distinta duración pueden solaparse parcialmente (10:00 corte de 60min vs
> 10:30 barba de 30min) — eso lo cubre el `FOR UPDATE` con chequeo de rango
> `[starts_at, ends_at)`, no el índice. El índice es la red, no la lógica.

- Índices: `(tenant_id, starts_at)` para el calendario;
  `(status, expires_at)` para el job de expiración.

## payments

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `reservation_id` | uuid NOT NULL | FK reservations |
| `buy_order` | text NOT NULL **UNIQUE** | **clave de idempotencia** |
| `token_ws` | text NULL | token de Webpay |
| `amount_clp` | int NOT NULL | |
| `status` | enum NOT NULL | `INITIATED` \| `APPROVED` \| `REJECTED` \| `FAILED` |
| `attempt` | int NOT NULL | 1, 2, 3… |
| `raw_response` | jsonb NULL | respuesta cruda de Transbank (auditoría) |

- `buy_order = {reservation_id}-{attempt}` → único por intento.
  Un doble commit del mismo `buy_order` devuelve OK sin re-procesar
  (`adr/0002` / flujo 2 en arquitectura).
- Una reserva puede tener **varios** payments (intento 1 rechazado, intento 2
  aprobado). Máximo un `APPROVED` por reserva — validar en aplicación.
- `raw_response` guarda todo lo que devuelve Transbank: cuando algo falle en
  producción, es la única fuente de verdad.
- Índice: `UNIQUE (buy_order)`, `(reservation_id)`.

## reminders

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `reservation_id` | uuid NOT NULL | FK reservations |
| `channel` | enum NOT NULL | `EMAIL` \| `TELEGRAM` \| `WHATSAPP` |
| `status` | enum NOT NULL | `PENDING` \| `SENT` \| `FAILED` |
| `scheduled_for` | timestamptz NOT NULL | `starts_at - 24h` |
| `sent_at` | timestamptz NULL | |
| `attempts` | int NOT NULL | default 0, para backoff |
| `last_error` | text NULL | |

- **Índice único: `UNIQUE (reservation_id, channel)`.** Ésta es la
  idempotencia: la fila se inserta **antes** de enviar. Si el worker se cae
  después de enviar pero antes de marcar `SENT`, el reintento choca con el
  índice y no manda un segundo mensaje.
- Índice: `(status, scheduled_for)`.

## idempotency_keys

Para escrituras sensibles vía API (cliente reintenta un POST).

| Columna | Tipo | Notas |
|---|---|---|
| `key` | text PK | header `Idempotency-Key` |
| `tenant_id` | uuid NOT NULL | |
| `endpoint` | text NOT NULL | |
| `request_hash` | text NOT NULL | detecta misma key con distinto body |
| `response_status` | int NULL | |
| `response_body` | jsonb NULL | se devuelve tal cual en el reintento |
| `created_at` | timestamptz NOT NULL | |

- TTL: limpiar filas de más de 24h con un job.

---

## Diagrama de relaciones

```
tenants ──┬─< users (OWNER|STAFF; CLIENT puede ir sin tenant)
          ├─< services ──────< reservations >────── users (CLIENT)
          ├─< availability_rules
          ├─< availability_exceptions
          └─< reservations ──┬─< payments
                             └─< reminders
```

## Orden de migraciones

Todo el esquema se migra completo desde el inicio, con `tenant_id` en todas
las tablas. La multi-tenancy no se agrega después: retrofittearla sobre un
esquema existente obliga a tocar cada tabla, cada query y cada índice.

1. `extension pgcrypto` (para `gen_random_uuid()`)
2. enums (`user_role`, `reservation_status`, `payment_status`,
   `reminder_channel`, `reminder_status`)
3. `tenants` → `users` → `services` → `availability_rules` →
   `availability_exceptions` → `reservations` → `payments` → `reminders` →
   `idempotency_keys`
4. índices, incluido `uq_reservation_active_slot`

Migraciones versionadas con TypeORM. **Nunca `synchronize: true`.**
Una migración aplicada no se modifica: se crea una nueva.
