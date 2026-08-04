import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import {
  EXPIRATION_QUEUE,
  EXPIRATION_SWEEP_INTERVAL_MS,
  EXPIRATION_SWEEP_JOB,
} from './expiration.queue';
import { ReservationsService } from './reservations.service';

/**
 * El primer job *repetible* del proyecto —hasta hoy BullMQ solo se usaba para
 * jobs diferidos, en `notifications`— así que sienta el patrón para los que
 * vengan (día 10: refresh de la vista de métricas).
 *
 * Aislamiento API/worker con el mismo mecanismo que `ReminderProcessor`:
 * `autorun: false` en el decorador, porque el `Worker` de BullMQ arranca a
 * consumir apenas se construye y un `pause()` posterior en `onModuleInit`
 * llega tarde para un job que ya estaba listo al bootear (esa carrera se
 * verificó a mano con `ReminderProcessor`, no hace falta repetirlo acá).
 *
 * `upsertJobScheduler` es la API vigente en BullMQ v6 para jobs repetibles
 * —la vieja `queue.add(..., {repeat})` queda para casos puntuales— y es
 * idempotente por diseño: llamarla en cada boot del worker con la misma
 * clave no duplica el schedule, verificado contra Redis real.
 */
@Processor(EXPIRATION_QUEUE, { autorun: false })
export class ExpirationProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ExpirationProcessor.name);

  constructor(
    @InjectQueue(EXPIRATION_QUEUE) private readonly queue: Queue,
    private readonly reservationsService: ReservationsService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    if (process.env.WORKER_MODE !== 'true') {
      return;
    }

    await this.queue.upsertJobScheduler(
      EXPIRATION_SWEEP_JOB,
      { every: EXPIRATION_SWEEP_INTERVAL_MS },
      { name: EXPIRATION_SWEEP_JOB },
    );
    this.worker.run();
  }

  async process(_job: Job): Promise<void> {
    const liberados = await this.reservationsService.expireStalePending();

    if (liberados > 0) {
      this.logger.log(`${liberados} reserva(s) vencida(s) liberadas`);
    }
  }
}
