# Producto

## El problema

Las pymes chilenas que venden **tiempo** (barberías, consultas médicas,
kinesiólogos, canchas, veterinarias, tatuadores) agendan por WhatsApp y
cuaderno. Eso produce tres dolores concretos:

1. **Dobles reservas** — dos clientes con la misma hora. Alguien se va enojado.
2. **Inasistencia (no-show)** — el cliente no llega y esa hora no se vende.
3. **Cero visibilidad** — el dueño no sabe qué servicio le rinde, cuánto
   ocupa su semana, ni cuánta plata deja de ganar por no-shows.

## La solución

Un SaaS multi-tenant donde el negocio se registra, configura sus servicios y
horarios, y publica una página propia (`/reserva/su-slug`) donde sus clientes
agendan y **pagan online con Webpay**. El sistema manda recordatorios
automáticos 24h antes y le muestra al dueño un panel con sus números.

| Dolor | Cómo se ataca |
|---|---|
| Dobles reservas | Lock pesimista + índice único: es **imposible** por diseño |
| No-show | Pago anticipado + recordatorio automático 24h antes |
| Sin visibilidad | Panel de métricas con ocupación, ingresos, top servicios |

Pagar para reservar es lo que resuelve el no-show de verdad: el cliente que
ya pagó, llega. Y si no llega, el negocio no perdió la hora.

## Actores

| Rol | Qué hace |
|---|---|
| `OWNER` | Dueño del negocio. Configura servicios, horarios, ve métricas |
| `STAFF` | Trabaja en el negocio. Ve la agenda, no toca configuración ni plata |
| `CLIENT` | Reserva y paga. Puede ser cliente de varios negocios |

Un `CLIENT` no pertenece a un tenant: el mismo email puede reservar en la
barbería y en la veterinaria.

## Reglas de negocio

### Reservas
- Una reserva se crea en estado `PENDING` con **10 minutos** para pagar.
- Pasado ese plazo, expira sola y el slot vuelve a estar disponible.
- Una reserva solo queda firme (`CONFIRMED`) cuando **Webpay confirma el
  pago**. Nunca antes.
- **Nunca dos reservas activas que se solapen** para el mismo negocio y
  servicio. Es la invariante que define el producto.
- El precio se **congela al reservar**: si el negocio sube el precio mañana,
  la reserva de ayer mantiene lo que el cliente pagó.

### Horarios
- El negocio define reglas semanales (día, hora inicio, hora fin, intervalo).
- Las excepciones (feriados, vacaciones, un sábado cerrado) ganan sobre la
  regla semanal.
- Los slots **se calculan**, no se almacenan: reglas − excepciones − reservas
  activas.
- Cada negocio tiene su timezone (default `America/Santiago`). Todo se guarda
  en UTC.

### Pagos
- Webpay Plus, ambiente de **integración** (sandbox gratuito de Transbank).
- Precios en **CLP entero**. El peso chileno no tiene decimales.
- Un pago rechazado no cancela la reserva: sigue `PENDING` y el cliente puede
  reintentar hasta que expire.
- Un doble commit del mismo `buy_order` no cobra dos veces (idempotencia).

### Recordatorios
- Se envía **uno solo** por reserva y canal, 24h antes del turno.
- Canales activos en la demo: email y Telegram (ambos gratis).
- WhatsApp está implementado detrás de la interfaz pero **no activo**: la API
  de Meta cobra por conversación iniciada por la empresa y requiere número
  verificado y plantillas pre-aprobadas. Ver `adr/0003`.

### Multi-tenancy
- Cada negocio ve **solo** sus datos. Sin excepciones.
- La página pública de un negocio no revela nada de otro.
- El slug es único global: es la URL.

## Alcance — qué NO es esto

Definir el borde es parte del diseño:

- **No es un e-commerce.** Vende tiempo (calendario), no productos (catálogo,
  carrito, inventario, despacho). El motor de concurrencia sería transferible,
  pero sería otro proyecto.
- **No es un ERP ni un CRM.** No lleva contabilidad, boletas ni fichas de
  cliente.
- **No hay app móvil.** La API es agnóstica al cliente: hoy Angular, mañana
  una PWA o app nativa sin tocar el backend.
- **No hay reservas recurrentes** (todos los martes a las 10). Fuera de
  alcance para la v1.
- **No hay pago en efectivo / reserva sin pagar.** El pago anticipado es
  justamente lo que resuelve el no-show.

## Estado

Producto en desarrollo activo. La v1 cubre el flujo completo: registro del
negocio, configuración de servicios y horarios, página pública de reservas,
pago con Webpay, recordatorios automáticos y panel de métricas.

Limitaciones conocidas de la v1:

- Webpay opera en **ambiente de integración** (el paso a producción requiere
  convenio comercial con Transbank).
- WhatsApp implementado pero no activo — ver `adr/0003`.
- El asistente IA usa el free tier de Gemini, por lo que no se le envía PII.
  Ver `adr/0004`.
