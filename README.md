# ReservaFácil

SaaS multi-tenant de reservas de horas para pymes chilenas: barberías,
consultas médicas, kinesiólogos, canchas, veterinarias, tatuadores.

Los negocios configuran sus servicios y horarios y publican una página propia
donde sus clientes agendan y pagan con Webpay. El sistema envía recordatorios
automáticos 24h antes del turno y le muestra al dueño un panel con su
ocupación, ingresos y tasa de inasistencia.

## Qué resuelve

| Problema | Solución |
|---|---|
| Dobles reservas | Lock pesimista + índice único: imposible por diseño |
| Inasistencia (no-show) | Pago anticipado + recordatorio automático |
| Cero visibilidad del negocio | Panel de métricas con datos reales |

## Stack

**Backend:** NestJS · TypeORM · PostgreSQL 16 · Redis + BullMQ
**Frontend:** Angular 18 (standalone + signals) · Socket.IO
**Integraciones:** Transbank Webpay Plus · Gemini (function calling)
**Infra:** Docker · Nginx · GitHub Actions

## Arquitectura

Monolito modular — un codebase, dos procesos (`api` y `worker`: mismo
código, distinto entrypoint). Nada de microservicios, detalle en
[`adr/0001`](docs/adr/0001-monolito-modular.md).

```
Navegador (Angular SPA)
     │ HTTPS                    │ Socket.IO
     ▼                          ▼
   Nginx  ──▶  api (NestJS, HTTP + WebSocket)
                    │
                    ├──▶ Postgres · Redis
                    ├──▶ Webpay Plus   (inicia y confirma el pago)
                    └──▶ Gemini        (function calling del chat)

worker: mismo código de `api`, otro entrypoint — consume la cola de
recordatorios en Redis en vez de servir HTTP.
```

Mapa de módulos y fronteras en [`docs/02-arquitectura.md`](docs/02-arquitectura.md).

## Arranque local

```bash
cp .env.example .env
docker compose up -d
```

API en `http://localhost:3000`, Swagger en `/docs`, frontend en
`http://localhost:4200`.

## Demo

`pnpm --filter api seed` deja dos negocios con historia y agenda futura:

| Negocio | URL | Login del dueño |
|---|---|---|
| Barbería Nogal | `/barberia-nogal` | `matias@barberianogal.cl` |
| Pádel Arena Ñuñoa | `/padel-arena` | `daniela@padelarena.cl` |

Contraseña de ambas cuentas: `demo1234`.

## Prueba de carga

100 clientes disparando al mismo slot a la vez (`pnpm --filter api test:load`,
detalle del invariante en `adr/0002`):

| Métrica | Resultado |
|---|---|
| `201 Created` | 1 |
| `409 Conflict` | 99 |
| Dobles reservas | 0 |
| p95 latencia | 562 ms |

El lock pesimista y el índice único parcial hacen exactamente lo que prometen
bajo carga: gana una sola petición, todas las demás chocan limpio contra el
`409`, ninguna reserva se duplica.

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/01-producto.md`](docs/01-producto.md) | Qué hace, para quién, reglas de negocio |
| [`docs/02-arquitectura.md`](docs/02-arquitectura.md) | Módulos, fronteras, flujos críticos |
| [`docs/03-modelo-datos.md`](docs/03-modelo-datos.md) | Tablas, estados, invariantes |
| [`docs/04-convenciones.md`](docs/04-convenciones.md) | Código, naming, tests |
| [`docs/adr/`](docs/adr/) | Decisiones de arquitectura y sus trade-offs |

## Licencia

Ver [`LICENSE`](LICENSE).
