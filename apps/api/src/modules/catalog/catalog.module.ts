import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantsModule } from '../tenants/tenants.module';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { AvailabilityException } from './entities/availability-exception.entity';
import { AvailabilityRule } from './entities/availability-rule.entity';
import { Service } from './entities/service.entity';
import { PublicController } from './public.controller';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Service, AvailabilityRule, AvailabilityException]),
    TenantsModule,
  ],
  controllers: [ServicesController, AvailabilityController, PublicController],
  providers: [ServicesService, AvailabilityService],
  // La frontera: reservations (día 3) y ai (día 11) consumen estos dos.
  exports: [ServicesService, AvailabilityService],
})
export class CatalogModule {}
