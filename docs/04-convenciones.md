# Convenciones

> Documento vivo. Solo contiene convenciones ya aplicadas en el código: una
> convención escrita se sigue aunque esté mal, así que no se documenta lo que
> todavía no se ha probado.

## Idioma

| Dónde | Idioma |
|---|---|
| Código, identificadores, nombres de archivo | **Inglés** |
| Comentarios | **Español** |
| Documentación (`docs/`, README) | **Español** |
| Prefijo de commit (`feat:`, `fix:`) | **Inglés** |
| Descripción del commit | **Español** |
| Nombres de rama | **Inglés** |

## Naming

| Qué | Convención | Ejemplo |
|---|---|---|
| Archivos | `kebab-case.tipo.ts` | `slot-locking.service.ts` |
| Clases | `PascalCase` | `ReservationsService` |
| Variables, métodos | `camelCase` | `findAvailableSlots()` |
| Tablas y columnas BD | `snake_case` | `reservation_id`, `expires_at` |
| Enums (valores) | `SCREAMING_SNAKE` | `CONFIRMED`, `PENDING` |
| Rutas HTTP | `kebab-case` plural | `/reservations`, `/public/:slug` |

Los nombres de dominio se mantienen **en inglés** aunque el negocio sea
chileno: `reservation`, no `reserva`. Una sola lengua en el código.

## Estructura de un módulo

```
modules/reservations/
├── reservations.module.ts       ← define exports = LA FRONTERA
├── reservations.controller.ts
├── reservations.service.ts      ← exportado
├── slot-locking.service.ts      ← NO exportado, interno
├── dto/
├── entities/
└── *.spec.ts                    ← junto al archivo que prueba
```

- **Módulo chico (<8 archivos) queda plano.** No aplicar la plantilla por
  simetría: la asimetría entre módulos es intencional.
- Solo lo que está en `exports` del `@Module` cruza la frontera.
- **Prohibido importar internals de otro módulo por ruta relativa.** Hoy se
  cuida en revisión de código; automatizarlo con ESLint `no-restricted-imports`
  está pendiente (ver *Por definir*).

## Contratos compartidos (`packages/contracts`)

- El paquete define **solo tipos e interfaces** (`CreateServiceRequest`,
  `PublicAvailabilityResponse`, `JwtPayload`…): el contrato entre API y web.
- Los DTOs de la API `implements` esas interfaces y agregan los decoradores de
  `class-validator`. Así el shape del request vive en un solo lugar y la
  validación en el borde no puede divergir del tipo que consume el front.
- Sin lógica ni dependencias de framework: el paquete lo importan ambos lados.

## Git

- **Trunk-based.** `main` protegida, siempre desplegable, CI verde.
- Ramas cortas (1–2 días): `feat/reservation-locking`, `fix/expired-slot`.
  Se borran tras el merge.
- Merge a `main` solo con CI verde y la feature verificada end-to-end.
- **Commits atómicos:** una intención por commit. Nada de `wip` ni
  `arreglos varios`.
- Formato: `feat: agregar lock pesimista en creación de reserva`
  Una línea, imperativo, sin punto final. Cuerpo solo si aporta el *porqué*.

## Errores HTTP

| Código | Cuándo |
|---|---|
| `400` | DTO inválido (lo tira `ValidationPipe`) |
| `401` | Sin token o token vencido |
| `403` | Token válido pero rol insuficiente, o token sin negocio asociado |
| `404` | No existe **o no es de tu tenant** (no filtrar existencia) |
| `409` | Conflicto de unicidad: slug tomado, regla que se solapa, excepción duplicada. El día 3 se suma el **slot ya ocupado** (lock de `reservations`) |
| `422` | Transición de estado inválida (ej. cancelar una ya cancelada) |

Un recurso de otro tenant devuelve `404`, no `403`: decir "existe pero no es
tuyo" ya es filtrar información entre negocios.

## Base de datos

- Migraciones TypeORM versionadas. **Nunca `synchronize: true`.**
- Una migración aplicada **no se modifica**: se crea una nueva.
- Toda tabla de negocio: `tenant_id NOT NULL` + FK.
- Todo índice de búsqueda parte por `tenant_id`.
- Plata en **CLP entero** (`int`), nunca `float` ni `numeric`.
- Timestamps `timestamptz` en UTC. Las horas de atención se guardan en hora
  local del negocio (`time`) y se convierten a UTC con Luxon usando
  `tenants.timezone` al calcular slots — nunca se suma offset a mano.
- **Baja lógica (`active = false`), no `DELETE`**, en entidades a las que otras
  apuntan por FK (ej. `services`): borrarlas rompería el historial de reservas.

## Tests

- `*.spec.ts` al lado del archivo que prueba.
- Unit para lógica pura (máquina de estados, cálculo de slots).
- e2e contra Postgres real —la base `_test` que crea el `docker-compose` y
  migra `global-setup.ts`—, no mocks de repositorio.
- **El test de concurrencia es obligatorio** para cualquier cambio que toque
  `reservations`.

---

## Por definir

- [ ] Formato de respuesta de error (shape del JSON)
- [ ] Estrategia de logging (qué se loguea, qué nunca — PII)
- [ ] Configuración de ESLint + Prettier
- [ ] Manejo de fechas en el front (librería, formato)
