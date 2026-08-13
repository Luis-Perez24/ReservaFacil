# ADR 0005 — TypeORM como ORM

**Estado:** aceptada

## Contexto

El proyecto necesita un ORM con: migraciones versionadas, transacciones
explícitas y **locking pesimista** (`FOR UPDATE`), que es el mecanismo que
sostiene la invariante central del sistema (`adr/0002`).

## Decisión

**TypeORM.**

- Locking pesimista nativo: `setLock('pessimistic_write')` en el query
  builder, o `{ lock: { mode: 'pessimistic_write' } }`.
- Migraciones versionadas por archivo, con `up`/`down`.
- Entidades con decoradores — modelo mental idéntico a JPA.
- Integración de primera clase con NestJS (`@nestjs/typeorm`).
- **`synchronize: true` prohibido**, siempre. Es cómodo en desarrollo y
  destructivo en producción.

## Alternativas descartadas

**Prisma.** Mejor DX y tipos más limpios, pero su soporte de `FOR UPDATE` es
indirecto: obliga a bajar a `$queryRaw`. Eso significa SQL crudo y sin tipos
justo en el flujo más crítico del sistema.

**SQL crudo (pg).** Máximo control, pero migraciones y mapeo a mano: tiempo
en plomería en vez de producto.

**Sequelize.** Menos idiomático en TypeScript, sin integración oficial con
Nest.

## Consecuencias

**A favor:** `FOR UPDATE` de primera clase con tipos, migraciones
versionadas que sobreviven al deploy, integración oficial con Nest.

**En contra:** TypeORM tiene fama merecida de bugs en casos raros y su
documentación es irregular. Se mitiga usándolo simple: entidades, query
builder para lo crítico, sin patrones exóticos.

**Regla dura:** una migración aplicada **no se modifica**. Se crea una nueva.
Modificar una migración ya corrida es la forma más rápida de que producción y
desarrollo dejen de parecerse.
