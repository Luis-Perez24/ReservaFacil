# ADR 0001 — Monolito modular

**Estado:** aceptada

## Contexto

Un equipo pequeño. Un producto. Un ambiente de despliegue. El sistema tiene
dominios distinguibles —reservas, pagos, notificaciones, IA, métricas— con
fronteras de negocio reales entre ellos.

## Decisión

**Monolito modular en NestJS.** Un proceso desplegable con módulos de
frontera clara, donde la frontera es el `exports` del `@Module` y se refuerza
con ESLint. Un segundo proceso para el worker de BullMQ, que es **el mismo
codebase** con otro entrypoint (`main.worker.ts`).

## Alternativas descartadas

**Microservicios.** Complejidad de red, despliegue y debugging distribuido
sin ningún beneficio a esta escala. Microservicios resuelven un problema
**organizacional** —varios equipos que se pisan al desplegar— no uno técnico.
Sería complejidad que el proyecto no se ha ganado.

**Monolito sin módulos (capas: `controllers/`, `services/`, `entities/`).**
Es lo razonable con un solo dominio. Acá no: pagos y reservas son mundos
distintos y la frontera tiene que ser explícita. Con `services/` plano, nada
impide que `PaymentsService` toque las tablas de reservas directo.

## Consecuencias

**A favor:** un deploy, una transacción de BD que abarca todo, debugging con
un stack trace completo, cero latencia de red entre módulos.

**En contra:** disciplina. Nada obliga físicamente a respetar la frontera
—en TypeScript no existe `package-private`, así que un `import` directo por
ruta relativa la salta sin que Nest se entere. Por eso el ESLint. Si un
módulo quedara mal recortado, dolería más que un `services/` plano.

**A futuro:** si algún módulo necesitara escalar aparte, el corte ya está
hecho: se extrae la carpeta y se reemplaza la llamada a método por HTTP. No
es gratis, pero es un camino, no una reescritura.
