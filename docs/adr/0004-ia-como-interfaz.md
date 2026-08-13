# ADR 0004 — La IA es interfaz, nunca autoridad

**Estado:** aceptada

## Contexto

Un chat en lenguaje natural ("¿tienen hora para corte el sábado en la
tarde?") es una interfaz cómoda para reservar. Pero un LLM **alucina**: si se
le pide que responda con horarios, va a inventar horarios que suenan
plausibles. Un sistema de reservas que inventa disponibilidad es peor que no
tener chat.

## Decisión

**Gemini con function calling. El LLM decide qué función llamar; el backend
la ejecuta.**

```
chat web → api/ai → Gemini (mensaje + function declarations)
  ← Gemini: "llama consultar_disponibilidad(servicio='corte', fecha='sábado')"
  api ejecuta la función REAL contra catalog (validada, sin PII)
  → devuelve slots reales → Gemini los redacta en lenguaje natural
  → la reserva final pasa por POST /reservations, el mismo endpoint
    transaccional de siempre
```

Reglas duras:

1. **Gemini nunca toca la BD.** Solo elige la función.
2. **Los datos siempre salen del backend validado.** El LLM redacta, no
   averigua.
3. **La reserva pasa por el mismo endpoint transaccional** con su `FOR
   UPDATE`. La IA no tiene un camino privilegiado.
4. **Nada de PII hacia Gemini**: sin nombres, RUT, teléfonos ni emails.

## Alternativas descartadas

**Pasarle la disponibilidad en el prompt y que responda libre.** Alucina, y
además la disponibilidad cambia entre que se arma el prompt y que el cliente
decide. Datos rancios + invención.

**Darle acceso a la BD (text-to-SQL).** Un LLM escribiendo SQL contra una
base multi-tenant es un incidente de seguridad esperando ocurrir: se salta el
`TenantGuard` y con él todo el aislamiento entre negocios.

**Que la IA cree la reserva por un camino propio.** Duplicaría la lógica del
lock. Dos caminos para la misma invariante = uno de los dos está mal tarde o
temprano.

## Consecuencias

**A favor:** imposible que invente horas. El LLM es una capa de traducción
sobre la misma lógica validada de siempre. Si Gemini desapareciera mañana, el
sistema funciona igual.

**En contra:** más redondeos de red (más latencia) y dependencia de un
servicio externo con rate limits.

**Robustez, por lo anterior:**
- 429 → backoff exponencial + jitter.
- Cola de requests a Gemini.
- **Degradación elegante:** si Gemini cae, el chat ofrece el buscador manual
  y la reserva se completa igual. La IA es una comodidad, nunca un camino
  crítico.

**Privacidad:** en el free tier, Google puede usar los prompts para entrenar.
Por eso la sanitización de PII no es opcional. En producción real se migraría
a tier pagado o Vertex AI. Documentado como limitación en el README.
