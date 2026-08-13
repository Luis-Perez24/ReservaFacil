# ADR 0003 — Notificaciones con Strategy

**Estado:** aceptada

## Contexto

Las pymes chilenas viven en WhatsApp: es el canal que sus clientes
efectivamente leen. Pero la **WhatsApp Business API no es gratis**: cobra por
conversación iniciada por la empresa, requiere número verificado y plantillas
pre-aprobadas por Meta (y desde abril 2026 factura en CLP). Telegram es
gratis pero casi ninguna pyme chilena lo usa. Email es gratis y universal
aunque se lea menos.

O sea: **el canal correcto para producción no es el canal viable para la
demo.**

## Decisión

Interfaz `NotificationChannel` con implementaciones intercambiables (patrón
Strategy).

- **Activos en la demo:** email + Telegram (ambos gratis, funcionando).
- **WhatsApp:** implementado detrás de la interfaz, desactivado por
  `@Profile`/env. Documentado como "listo para conectar vía Meta Cloud API o
  Twilio en producción".

**Este es el único puerto del proyecto**, y a propósito: es la única
dependencia donde el cambio es real y previsible. Todo lo demás va directo
contra Postgres, que no se va a mover.

## Alternativas descartadas

**Solo email, sin abstracción.** Más simple, pero el día que entre WhatsApp
—que es cuándo, no si— habría que tocar la lógica de negocio para agregar un
`if`. La restricción es económica y conocida de antemano: eso es exactamente
lo que un puerto resuelve.

**Activar WhatsApp desde el inicio.** Costo por conversación, más
verificación de número y aprobación de plantillas por Meta. Gasto y fricción
antes de tener un solo negocio usando el sistema.

**Un puerto por cada dependencia externa (hexagonal completa).** Un puerto
sin un segundo adaptador probable es ceremonia: costo sin retorno. La
abstracción se paga sola solo donde el cambio es real.

## Consecuencias

**A favor:** agregar WhatsApp es implementar una interfaz, sin tocar la
lógica de reservas. La restricción de negocio queda documentada en el código,
no en la cabeza de nadie.

**En contra:** una indirección más. Con un solo canal para siempre, sobraría.

**Nota de implementación:** el envío es idempotente vía
`UNIQUE (reservation_id, channel)` en `reminders`, insertando la fila
**antes** de enviar. Eso es de la tabla, no del Strategy — pero es lo que
garantiza que un worker que muere a medio envío no mande dos mensajes.
