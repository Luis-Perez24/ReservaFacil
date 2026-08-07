import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CatalogModule } from '../catalog/catalog.module';
import { TenantsModule } from '../tenants/tenants.module';
import { Reservation } from './entities/reservation.entity';
import { ExpirationProcessor } from './expiration.processor';
import { EXPIRATION_QUEUE } from './expiration.queue';
import { ReservationDashboardController } from './reservation-dashboard.controller';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

/**
 * El núcleo. No depende de `payments`, `notifications`, `realtime` ni `ai`: no
 * conoce a sus consumidores, les avisa por eventos. Sí depende de `catalog`
 * (servicio + duración + precio, y la disponibilidad para validar el slot) y de
 * `tenants` (resolver el tenant desde el slug público). Ambas son las
 * direcciones permitidas en `02-arquitectura.md`.
 *
 * La cola de expiración vive acá y no en un módulo aparte: libera el propio
 * estado del núcleo, no es un servicio para otro consumidor.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Reservation]),
    TenantsModule,
    CatalogModule,
    BullModule.registerQueue({ name: EXPIRATION_QUEUE }),
  ],
  controllers: [ReservationsController, ReservationDashboardController],
  providers: [ReservationsService, ExpirationProcessor],
  exports: [ReservationsService],
})
export class ReservationsModule {}
