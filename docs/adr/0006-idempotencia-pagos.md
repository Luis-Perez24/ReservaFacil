# ADR 0006 — Idempotencia en el pago de una reserva

**Estado:** aceptada

## Contexto

El retorno de Webpay no llega una sola vez de forma garantizada. El navegador
del cliente puede recargar la página de retorno, el usuario puede hacer doble
clic, y una red inestable puede reenviar la misma petición. Cada una de esas
repeticiones llega al backend como un commit más del mismo pago.

Dos cosas no pueden pasar nunca:

1. **Cobrar dos veces por la misma reserva.**
2. **Confirmar una reserva sin que el cobro haya quedado registrado**, o al
   revés: registrar un cobro aprobado cuya reserva sigue pendiente.

A esto se suma una restricción del proveedor: Transbank **rechaza el segundo
commit del mismo token**. Un reintento ingenuo no solo es redundante, devuelve
un error que podría interpretarse como un pago fallido cuando en realidad ya
fue aprobado.

## Decisión

**La clave de idempotencia es el `buy_order`**, con `UNIQUE` en la tabla
`payments`, y el commit se resuelve leyendo el estado ya persistido antes de
hablar con Transbank.

El flujo del retorno:

```
commit(token)
  → transacción + SELECT … FOR UPDATE sobre la fila del pago
  → si el pago ya NO está INITIATED
        → devolver el resultado guardado, sin llamar a Transbank
  → si está INITIATED
        → commit contra Transbank
        → guardar raw_response SIEMPRE (aprobado o no)
        → si aprobado  → payment APPROVED + reserva PENDING → PAID → CONFIRMED
        → si rechazado → payment REJECTED; la reserva sigue PENDING y expira sola
```

Tres propiedades sostienen la invariante:

- **El estado del pago es la memoria.** Un intento resuelto (`APPROVED`,
  `REJECTED` o `FAILED`) no se vuelve a procesar: su resultado se devuelve tal
  cual quedó guardado.
- **El lock pesimista serializa los commits concurrentes** del mismo pago. Sin
  él, dos peticiones simultáneas podrían leer ambas `INITIATED` y llamar las dos
  a Transbank.
- **Registrar el pago y confirmar la reserva ocurren en la misma transacción.**
  No existe un estado intermedio observable donde el dinero esté cobrado y la
  reserva no confirmada.

Cada reintento de pago del cliente genera un intento nuevo
(`attempt` 1, 2, 3…) con su propio `buy_order`, de modo que un rechazo no
bloquea la reserva: se puede volver a intentar mientras la retención siga viva.

## Alternativas descartadas

**Usar la tabla genérica `idempotency_keys`.** El esquema la incluye para
escrituras sensibles vía API, donde el cliente manda un header
`Idempotency-Key` que el backend no controla. El pago no necesita ese
mecanismo: ya tiene una clave de idempotencia **natural del dominio**, el
`buy_order`, que además es la que el propio Transbank conoce y devuelve. Meter
una segunda clave artificial encima duplicaría la fuente de verdad y obligaría
a mantener sincronizadas dos tablas para el mismo hecho. `idempotency_keys`
sigue reservada para los endpoints donde la clave la pone el cliente.

**Confiar solo en el chequeo de estado, sin lock.** Cubre el caso común —el
usuario recarga la página unos segundos después—, pero deja abierta la carrera
real: dos peticiones simultáneas leen `INITIATED` a la vez y ambas llaman a
Transbank. Tratándose de dinero, el caso improbable también importa.

**Reintentar el commit contra Transbank y confiar en su respuesta.** Transbank
rechaza el segundo commit del mismo token, así que la respuesta del reintento
no distingue "este pago falló" de "este pago ya fue aprobado antes". Consultar
el estado remoto en cada repetición, además, ata la respuesta del sistema a la
disponibilidad de un tercero para responder algo que ya está en la base local.

**Confirmar la reserva fuera de la transacción del pago.** Simplifica el código
y acorta el lock, pero abre una ventana en la que el cobro está registrado y la
reserva no confirmada. Si el proceso muere en esa ventana, queda un cliente con
el cargo hecho y sin su hora tomada: el peor resultado posible del sistema.

## Consecuencias

**A favor:** el segundo commit es una lectura local; no depende de la red ni
del estado de Transbank. La respuesta a una repetición es idéntica a la del
primer commit, así que el frontend no necesita distinguir los casos. El
`raw_response` queda persistido siempre y es la única fuente de verdad cuando
haya que auditar un pago.

**En contra:** la llamada HTTP a Transbank ocurre **dentro** de la transacción
de base de datos, con el lock tomado. Mantener una transacción abierta mientras
se espera a un servicio externo es un anti-patrón conocido: si Transbank tarda
o se cuelga, esa conexión del pool queda retenida. Se acepta a conciencia
porque la alternativa —soltar el lock antes de la llamada— reintroduce
exactamente la carrera que se quiere evitar, y porque el perfil de carga del
producto (reservas de pymes, no picos de comercio masivo) hace que la
contención sobre la fila de un pago concreto sea mínima.

**Riesgo asumido:** si el proceso muere después de que Transbank aprobó pero
antes de que la transacción commitee, el cobro existe en Transbank y no en la
base. La reserva sigue `PENDING` y expira liberando el slot. Es un caso
detectable —el `buy_order` está en Transbank y el pago local quedó
`INITIATED`— y su resolución es una conciliación manual. Se prefiere ese
desenlace, poco frecuente y visible, a confirmar reservas sin respaldo.

## Sobre el estado `PAID`

La máquina de estados define `PENDING → PAID → CONFIRMED`, pero una reserva
nunca queda **persistida** en `PAID`: ambas transiciones se validan y se
aplican dentro de la misma transacción, y lo que se guarda es `CONFIRMED`.

El estado intermedio se mantiene en el modelo porque separa dos hechos que hoy
coinciden en el tiempo pero son distintos: *el dinero llegó* y *la reserva está
confirmada*. Cuando la confirmación tenga efectos propios —encolar
recordatorios (`adr/0003`), emitir eventos— `PAID` será el punto donde el cobro
ya está firme y esos efectos todavía no se dispararon. Eliminarlo ahora
obligaría a reintroducirlo entonces, con una migración del enum de por medio.
