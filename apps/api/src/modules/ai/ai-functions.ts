import type { GeminiFunctionDeclaration } from './gemini.client';

/**
 * Los dos esquemas del día 11 parte 1 (`.private/05-plan.md`). Declarativos a
 * propósito — se validan leyéndolos, no hay lógica acá — la ejecución real
 * vive en `AiService`.
 */
export const CONSULTAR_DISPONIBILIDAD = 'consultar_disponibilidad';
export const CREAR_RESERVA_TENTATIVA = 'crear_reserva_tentativa';

export const AI_FUNCTIONS: GeminiFunctionDeclaration[] = [
  {
    name: CONSULTAR_DISPONIBILIDAD,
    description:
      'Consulta los horarios realmente libres de un servicio del negocio en una fecha. ' +
      'Úsala siempre que el usuario pregunte por disponibilidad — nunca inventes horarios.',
    parameters: {
      type: 'object',
      properties: {
        servicio: {
          type: 'string',
          description: 'Nombre del servicio, como lo dijo el usuario (ej: "corte", "afeitado").',
        },
        fecha: {
          type: 'string',
          description: 'Fecha a consultar en formato YYYY-MM-DD, resuelta desde el lenguaje natural del usuario.',
        },
      },
      required: ['servicio', 'fecha'],
    },
  },
  {
    name: CREAR_RESERVA_TENTATIVA,
    description:
      'Valida que un horario específico siga disponible y arma un resumen para que el usuario confirme. ' +
      'No crea la reserva — solo la valida y describe. Úsala después de que el usuario eligió un horario concreto.',
    parameters: {
      type: 'object',
      properties: {
        servicioId: {
          type: 'string',
          description: 'El id del servicio, tal como vino en la respuesta de consultar_disponibilidad.',
        },
        startsAt: {
          type: 'string',
          description: 'Inicio del horario elegido, en ISO 8601 UTC, tal como vino en los slots devueltos.',
        },
      },
      required: ['servicioId', 'startsAt'],
    },
  },
];
