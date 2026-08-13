# Arquitectura

## Decisión: monolito modular

Un proceso NestJS con módulos de frontera clara, listos para extraerse si
alguna vez uno necesita escalar aparte. Detalle y trade-offs en `adr/0001`.

**No es un sistema distribuido.** Un solo codebase con lógica de negocio.
La regla: distribuido = varios procesos **con lógica de negocio propia**,
desplegables por separado, hablándose por la red. Postgres, Redis, Nginx y
el SPA de Angular son infraestructura y cliente — no cuentan.

### Procesos desplegables

| Proceso | Qué es |
|---|---|
| `api` | HTTP + WebSocket. Entrypoint `main.ts` |
| `worker` | **El mismo codebase**, entrypoint `main.worker.ts`. Consume BullMQ |
| `postgres` | infraestructura |
| `redis` | infraestructura |
| `web` | SPA Angular servida por Nginx — es el cliente |

> **El worker no es un segundo servicio.** Es el mismo monolito arrancado en
> otro modo: misma base de código, misma BD, mismos módulos. En Docker son
> dos contenedores con **la misma imagen** y distinto comando. Eso es normal
> en monolitos y no lo vuelve distribuido.

## Mapa de módulos

```
auth          → JWT (access + refresh), roles OWNER | STAFF | CLIENT, guards
tenants       → negocio, slug, branding, timezone
catalog       → servicios + reglas de disponibilidad → cálculo de slots libres
reservations  → NÚCLEO. Transacción + FOR UPDATE. Máquina de estados.
payments      → Webpay Plus. Idempotencia por buy_order. Confirma reservas.
notifications → interfaz NotificationChannel (Strategy). Encola en BullMQ.
realtime      → Socket.IO. Traduce eventos del núcleo a mensajes en vivo.
analytics     → vista materializada: ocupación, ingresos, top servicios, no-show
ai            → Gemini function calling. Solo lee; delega escritura a reservations.
```

`services` y `availability` van juntos en **`catalog`**: se consultan siempre
juntos (calcular un slot necesita el servicio y su duración) y separarlos
obligaría a que un módulo importe al otro en cada query. Lo que cambia junto,
vive junto.

### Dependencias permitidas

```
payments      → reservations
notifications → reservations   (por eventos)
realtime      → reservations   (por eventos)
ai            → catalog, reservations   (vía servicios exportados)
analytics     → (solo lee sus vistas materializadas)
reservations  → catalog
```

- **`reservations` no depende de `payments`, `notifications`, `realtime` ni
  `ai`.** El núcleo no conoce a sus consumidores. Si necesita avisarles, emite
  un evento — el mismo mecanismo para los dos: al confirmar una reserva
  (`notifications`, para el recordatorio) y al crearla (`realtime`, para el
  calendario en vivo).
- La frontera de cada módulo es su `exports` en el `@Module`. **Prohibido
  importar archivos internos de otro módulo por ruta relativa** — eso salta
  el sistema de DI y rompe la frontera sin que Nest lo note. Se refuerza con
  un test (`architecture.spec.ts`), que falla si aparece una dependencia
  fuera de esta tabla.

## Puertos: solo uno, y a propósito

El único puerto (Strategy) del proyecto es `NotificationChannel`, porque es
la única dependencia donde el cambio es **real y previsible**: hoy email y
Telegram, mañana WhatsApp. Ver `adr/0003`.

Todo lo demás va directo contra TypeORM/Postgres, sin abstracción. Postgres
no se va a mover. Un puerto sin un segundo adaptador probable es costo sin
retorno.

---

## Flujo crítico 1 — reserva concurrente

```
POST /reservations
  BEGIN
    SELECT … FROM reservations
      WHERE tenant_id = :t AND service_id = :s
        AND tstzrange(starts_at, ends_at) && tstzrange(:from, :to)
        AND ( status IN ('PAID','CONFIRMED')
              OR (status = 'PENDING' AND expires_at > now()) )   ← clave
      FOR UPDATE
    si hay filas → ROLLBACK → 409 Conflict
    INSERT reservation (PENDING, expires_at = now() + 10 min)
  COMMIT
  → emite reservation.slot_taken → realtime lo escucha → Socket.IO
    refresca el calendario de quien esté mirando ese negocio
```

**Cómo se libera el slot si nadie paga:** no hay un job por reserva —sería
uno por cada hold que se cree, la mayoría innecesarios—; un solo job
repetible barre cada 60s los `PENDING` con `expires_at` vencido y los pasa a
`EXPIRED`. El mismo predicado corre también, perezoso, dentro de la
transacción de arriba: si una nueva reserva se solapa con un hold vencido, lo
expira ahí mismo antes de insertar, sin esperar al barrido. Detalle en
`adr/0002` y en `ReservationsService.expireStalePending()`.

**El detalle que importa:** un `PENDING` con `expires_at < now()` se trata
como **libre**. Sin esa condición, un slot abandonado quedaría bloqueado 10
minutos aunque nadie vaya a pagarlo.

Red de seguridad a nivel BD: índice único parcial
`uq_reservation_active_slot` (ver `03-modelo-datos.md`). El lock es la
lógica; el índice es el seguro por si la lógica falla.

**Prueba de carga:** 100 requests concurrentes al mismo slot → 1×201,
99×409, 0 dobles reservas. Resultados medidos en `adr/0002`.

## Flujo crítico 2 — pago Webpay

```
crear transacción (buy_order = {reservation_id}-{attempt})
  → redirect a Webpay
  → retorno: commit(token_ws)
      - si ese buy_order ya está APPROVED → devolver OK (idempotente)
      - si aprobado  → PAID → CONFIRMED, cancelar job de expiración
      - si rechazado → payment REJECTED; la reserva sigue PENDING
                       y expira sola liberando el slot
      - si timeout   → igual que rechazado. Nunca confirmar sin commit.
```

Se guarda `raw_response` de Transbank siempre: cuando algo falle en
producción, es la única fuente de verdad.

Una reserva pasa a `CONFIRMED` **solo** tras confirmación de Webpay. Nunca
antes, nunca por optimismo.

## Flujo crítico 3 — recordatorios

```
al confirmar → encolar delayed job para (starts_at - 24h)
worker despierta
  → resuelve el canal vía NotificationChannel (Strategy)
  → INSERT en reminders (PENDING)   ← ANTES de enviar
       UNIQUE (reservation_id, channel) → si ya existe, no hace nada
  → envía
  → UPDATE status = SENT
```

Insertar antes de enviar es lo que hace el envío idempotente: si el worker
muere después de mandar el mail pero antes de marcar `SENT`, el reintento
choca con el índice único y no manda un segundo mensaje. Reintentos con
backoff exponencial.

## Flujo crítico 4 — asistente IA

```
chat web → api/ai → Gemini (mensaje + function declarations)
  ← Gemini: "llama consultar_disponibilidad(servicio='corte', fecha='sábado')"
  api ejecuta la función REAL contra catalog (validada, sin PII)
  → devuelve slots reales a Gemini → redacta la respuesta con esos datos
  → la reserva final pasa por POST /reservations, el mismo endpoint
    transaccional de siempre
```

**Gemini nunca toca la BD ni inventa horarios.** Solo decide qué función
llamar; el backend ejecuta, valida y devuelve. El LLM es interfaz, nunca
autoridad. Ver `adr/0004`.

**Robustez:** 429 → backoff exponencial + jitter; cola de requests;
degradación elegante — si Gemini cae, el chat ofrece el buscador manual y la
reserva se completa igual. La IA es una comodidad, no un camino crítico.

**Privacidad:** nunca nombres, RUT, teléfonos ni emails hacia Gemini. En el
free tier Google puede usar los prompts para entrenar. En producción real se
migraría a tier pagado o Vertex AI. Documentado como limitación.

---

## Multi-tenancy

`tenant_id` en cada tabla de negocio. `TenantGuard` lo extrae del JWT
(dashboard) o del slug de la URL (página pública) y lo inyecta en el request
context. **Ningún repositorio expone un método sin `tenant_id`.**

Pendiente de evaluación (`adr/0006`): Row-Level Security como segunda
barrera a nivel BD — la aplicación puede tener un bug, la política de RLS no.

## Realtime

Socket.IO con adaptador Redis (pub/sub). Room por `tenant:slug`. Cuando una
reserva se crea, expira o se cancela, el calendario de todos los que estén
mirando esa página se actualiza sin refrescar.

## Testing

| Tipo | Qué cubre |
|---|---|
| Unit | Máquina de estados, cálculo de slots, sanitización de PII |
| Integración | Repositorios contra Postgres real (Testcontainers) |
| **Concurrencia** | El `FOR UPDATE`: N requests simultáneos → 1 gana |
| E2E | Flujo completo reserva → pago → confirmación |
| Carga (k6) | 100 concurrentes al mismo slot. Resultado en el README |

El test de concurrencia es el más importante del proyecto: es la prueba de
que la invariante se cumple. Sin él, la garantía anti-doble-reserva es una
afirmación sin evidencia.
