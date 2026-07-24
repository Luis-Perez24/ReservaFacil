import { Module } from '@nestjs/common';

import { RealtimeGateway } from './realtime.gateway';

/**
 * Infraestructura de tiempo real. No es un módulo de negocio: `reservations`
 * puede depender de él sin romper la regla de no depender de otros dominios,
 * igual que depende de la base de datos.
 *
 * Con una sola instancia alcanza el Socket.IO en memoria. Cuando haya más de un
 * proceso sirviendo HTTP hará falta el adaptador de Redis para que un evento
 * emitido en una instancia llegue a los clientes conectados a otra
 * (`02-arquitectura.md`).
 */
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
