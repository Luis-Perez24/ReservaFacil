# ADR 0009 — Resiliencia del asistente IA en el mismo proceso, sin cola

**Estado:** aceptada

## Contexto

El proyecto ya tiene un patrón para trabajo que necesita reintentos y no
puede correr en el proceso HTTP: `ReminderProcessor`
(`apps/api/src/modules/notifications/reminder.processor.ts`). Su `Worker`
de BullMQ arranca con `autorun: false` y solo se pone en marcha si
`process.env.WORKER_MODE === 'true'` — a propósito, para que las réplicas
del proceso API no dupliquen el envío de recordatorios. `main.ts` (API) y
`main.worker.ts` (worker) son el mismo código, dos entrypoints
(`02-arquitectura.md`).

El chat del asistente IA (`POST /public/:slug/chat`) también necesita
reintentar ante fallas de Gemini (429, errores transitorios) con backoff y
jitter. La pregunta de diseño: ¿reusa el mismo patrón de cola, o hace algo
distinto?

La diferencia real: un recordatorio es trabajo en segundo plano — nadie
espera su resultado dentro de un request. El chat no. Quien llama a `POST
/public/:slug/chat` espera la respuesta en el mismo request-response. Si el
reintento de Gemini viviera en un `Processor` gateado por `WORKER_MODE`,
correr `pnpm --filter api start` sola (sin también levantar el proceso
worker) dejaría el chat colgado hasta el timeout — nadie estaría
consumiendo el job. En producción, obligaría a que el proceso worker esté
siempre arriba para que el chat funcione, una dependencia operativa nueva
para algo que termina dentro del mismo request.

## Decisión

La resiliencia de Gemini vive **en el mismo proceso, sin Redis de por
medio**: `ResilientGeminiClient`
(`apps/api/src/modules/ai/resilient-gemini.client.ts`) es un decorador
sobre `GeminiClient` que envuelve al cliente real (`GoogleGeminiClient`)
con:

- **Límite de concurrencia** (`ConcurrencyLimiter`, `apps/api/src/modules/
  ai/concurrency-limiter.ts`): como máximo 3 llamadas a Gemini a la vez
  desde el proceso, un semáforo en memoria — el resto espera su turno.
- **Backoff exponencial + jitter** (`gemini-retry.ts`): hasta 3 intentos
  ante cualquier falla, con un delay que crece exponencialmente y un
  jitter aleatorio para no sincronizar reintentos si llegan varios a la vez.

El decorador es invisible para `AiService` y para los tests: siguen viendo
el mismo `GeminiClient` abstracto de siempre (mismo patrón que
`WebpayClient`/`TransbankWebpayClient`, `adr` implícito de ese módulo).

## Alternativas descartadas

**El mismo patrón que `ReminderProcessor`** (`Processor` con `autorun:
false`, gateado por `WORKER_MODE`). Se descartó por el motivo del
Contexto: el chat responde dentro del mismo request, no es trabajo en
segundo plano. Forzar dos procesos para que funcione es una complicación
operativa real (en dev, hay que acordarse de correr también
`start:worker`; en producción, el chat depende de que ese proceso esté
sano) sin ningún beneficio a cambio — no hay riesgo de que dos réplicas
dupliquen el envío de un mismo mensaje de chat, cada request solo espera
su propio resultado.

**BullMQ con `job.waitUntilFinished()`** (encolar la llamada a Gemini y
esperar su resultado sincrónicamente dentro del mismo request, dejando que
BullMQ maneje los reintentos). Técnicamente viable — la versión de BullMQ
que ya usa el proyecto lo soporta — pero agrega una vuelta a Redis y la
maquinaria de colas persistentes (jobs que sobreviven un restart, se
reparten entre réplicas) para un reintento acotado que nace y muere dentro
de un mismo request HTTP. Ninguna de esas propiedades de una cola de
verdad aporta algo acá.

## Consecuencias

**A favor:** cero infraestructura nueva — no depende de Redis para este
flujo. El decorador es una clase chica, fácil de testear sin mocks de
BullMQ (`gemini-retry.spec.ts`, `concurrency-limiter.spec.ts`).

**En contra:** el límite de concurrencia y el estado de reintentos viven en
memoria de un único proceso. Con varias réplicas del API detrás de un load
balancer (no es el caso hoy), cada una tendría su propio tope de 3
llamadas simultáneas — no hay un límite global compartido entre réplicas.

**Riesgo asumido:** se acepta porque el perfil de carga del producto
(reservas de pymes, no picos de comercio masivo) hace improbable que el
límite por réplica importe en la práctica. Si algún día el tráfico lo
justifica, ahí sí valdría la pena reconsiderar un límite compartido (por
ejemplo, con Redis) — pero no antes, sería resolver un problema que
todavía no existe.
