/**
 * Eventos que la API empuja a la página pública por Socket.IO.
 *
 * La room es por negocio (`tenant:{slug}`): un cliente mirando la agenda de una
 * barbería no tiene por qué recibir el movimiento de otra.
 */

/** Nombre del evento; compartido para que servidor y navegador no se desincronicen. */
export const SLOT_TAKEN_EVENT = 'slot.taken';

/**
 * Un slot dejó de estar libre. No viaja quién reservó ni con qué datos: la
 * página pública es anónima y esto lo recibe cualquiera que esté mirando.
 */
export interface SlotTakenEvent {
  serviceId: string;
  /** Inicio del slot en ISO 8601 UTC. */
  startsAt: string;
}

/** Room de Socket.IO de un negocio. */
export function tenantRoom(slug: string): string {
  return `tenant:${slug}`;
}
