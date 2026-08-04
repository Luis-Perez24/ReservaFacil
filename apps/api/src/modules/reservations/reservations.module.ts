import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CatalogModule } from '../catalog/catalog.module';
import { TenantsModule } from '../tenants/tenants.module';
import { Reservation } from './entities/reservation.entity';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

/**
 * El núcleo. No depende de `payments`, `notifications`, `realtime` ni `ai`: no
 * conoce a sus consumidores, les avisa por eventos. Sí depende de `catalog`
 * (servicio + duración + precio, y la disponibilidad para validar el slot) y de
 * `tenants` (resolver el tenant desde el slug público). Ambas son las
 * direcciones permitidas en `02-arquitectura.md`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Reservation]), TenantsModule, CatalogModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
