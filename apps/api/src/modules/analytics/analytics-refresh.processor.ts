import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { AnalyticsService } from './analytics.service';
import { ANALYTICS_QUEUE, ANALYTICS_REFRESH_INTERVAL_MS, ANALYTICS_REFRESH_JOB } from './analytics.queue';

/**
 * Segundo job repetible del proyecto, mismo patrón que `ExpirationProcessor`
 * (día 9): `autorun: false` + `WORKER_MODE` + `upsertJobScheduler`. Ver ese
 * archivo para el razonamiento completo de por qué `autorun: false` y por
 * qué `upsertJobScheduler` es idempotente en cada boot del worker.
 */
@Processor(ANALYTICS_QUEUE, { autorun: false })
export class AnalyticsRefreshProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsRefreshProcessor.name);

  constructor(
    @InjectQueue(ANALYTICS_QUEUE) private readonly queue: Queue,
    private readonly analyticsService: AnalyticsService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    if (process.env.WORKER_MODE !== 'true') {
      return;
    }

    await this.queue.upsertJobScheduler(
      ANALYTICS_REFRESH_JOB,
      { every: ANALYTICS_REFRESH_INTERVAL_MS },
      { name: ANALYTICS_REFRESH_JOB },
    );
    this.worker.run();
  }

  async process(_job: Job): Promise<void> {
    await this.analyticsService.refresh();
    this.logger.log('Vistas de métricas refrescadas');
  }
}
