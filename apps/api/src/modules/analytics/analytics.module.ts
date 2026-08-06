import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AnalyticsController } from './analytics.controller';
import { AnalyticsRefreshProcessor } from './analytics-refresh.processor';
import { ANALYTICS_QUEUE } from './analytics.queue';
import { AnalyticsService } from './analytics.service';

/**
 * No depende de `reservations`/`catalog`/`payments`: lee directo las vistas
 * materializadas (adr/0007) vía SQL crudo, no sus servicios. El único
 * acoplamiento real es al esquema de esas vistas.
 */
@Module({
  imports: [BullModule.registerQueue({ name: ANALYTICS_QUEUE })],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRefreshProcessor],
})
export class AnalyticsModule {}
