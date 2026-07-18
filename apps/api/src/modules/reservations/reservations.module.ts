import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Reservation } from './entities/reservation.entity';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

/**
 * El núcleo. No depende de `payments`, `notifications` ni `ai`: no conoce a sus
 * consumidores. En la mitad B sumará `catalog` (servicio + duración + precio) y
 * la resolución del tenant desde el slug para el flujo de creación.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Reservation])],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
