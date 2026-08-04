import { Module } from '@nestjs/common';

import { ReservationsModule } from '../reservations/reservations.module';
import { RealtimeGateway } from './realtime.gateway';
import { SlotTakenListener } from './slot-taken.listener';

/**
 * Infraestructura de tiempo real: sabe empujar mensajes al navegador, no sabe
 * qué es una reserva.
 *
 * Escucha al núcleo en vez de ser llamado por él. La dependencia apunta
 * `realtime → reservations` —de quien reacciona hacia quien emite—, que es la
 * misma dirección que usa `notifications` y la que exige `adr/0001`: el núcleo
 * no conoce a sus consumidores. Importa `ReservationsModule` solo por el
 * contrato del evento; no le pide nada.
 *
 * Con una sola instancia alcanza el Socket.IO en memoria. Cuando haya más de un
 * proceso sirviendo HTTP hará falta el adaptador de Redis para que un evento
 * emitido en una instancia llegue a los clientes conectados a otra
 * (`02-arquitectura.md`).
 */
@Module({
  imports: [ReservationsModule],
  providers: [RealtimeGateway, SlotTakenListener],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
