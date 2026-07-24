import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { SLOT_TAKEN_EVENT, SlotTakenEvent, tenantRoom } from '@reservafacil/contracts';
import { Server, Socket } from 'socket.io';

/**
 * El canal en vivo de la página pública. Es infraestructura, no negocio: sabe
 * mandar mensajes, no sabe qué es una reserva.
 *
 * Solo empuja hacia el navegador. Nada que llegue por acá escribe en la base:
 * lo único que un cliente puede pedir es escuchar un negocio, y el resto son
 * avisos de salida. Reservar sigue siendo un POST con sus validaciones.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  /**
   * El navegador pide seguir un negocio por su slug. Se lo mete en la room de
   * ese negocio para que no reciba el movimiento de los demás.
   */
  @SubscribeMessage('watch-tenant')
  watchTenant(@ConnectedSocket() client: Socket, @MessageBody() slug: unknown): void {
    if (typeof slug !== 'string' || slug.length === 0 || slug.length > 100) {
      return;
    }

    void client.join(tenantRoom(slug));
  }

  /** Avisa a quienes miran ese negocio que el slot dejó de estar libre. */
  emitSlotTaken(slug: string, event: SlotTakenEvent): void {
    // Al arrancar el worker (main.worker.ts) no hay servidor HTTP y por lo tanto
    // tampoco gateway: sin esta guarda, el job de expiración reventaría.
    if (!this.server) {
      return;
    }

    this.logger.debug(`slot tomado en ${slug}: ${event.startsAt}`);
    this.server.to(tenantRoom(slug)).emit(SLOT_TAKEN_EVENT, event);
  }
}
