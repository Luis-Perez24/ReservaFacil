import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';

import { RemindersService } from './reminders.service';
import { REMINDERS_QUEUE, ReminderJobData } from './reminders.queue';

/**
 * El consumidor real. Vive en el mismo `AppModule` que usan `main.ts` y
 * `main.worker.ts` —mismo codebase, dos entrypoints (`02-arquitectura.md`)—,
 * así que este processor se instancia en los dos procesos por igual.
 *
 * Si el proceso HTTP también consumiera jobs, cada réplica del api sumaría
 * concurrencia de envío sin que nadie lo pidiera. `autorun: false` en el
 * decorador es lo que evita eso de verdad: el `Worker` de BullMQ arranca a
 * consumir apenas se construye, así que pausarlo *después* en `onModuleInit`
 * —lo primero que se probó— llega tarde para un job que ya estaba listo al
 * bootear (visto en pruebas manuales: el proceso API alcanzó a procesar un
 * job antes de que el `pause()` surtiera efecto). Con `autorun: false` el
 * worker no arranca solo; `WORKER_MODE=true` —la env que solo pone el comando
 * del contenedor worker, leída cruda por el mismo motivo que
 * `NOTIFICATIONS_WHATSAPP_ENABLED`— es lo único que lo pone en marcha.
 */
@Processor(REMINDERS_QUEUE, { autorun: false })
export class ReminderProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(private readonly remindersService: RemindersService) {
    super();
  }

  onModuleInit(): void {
    if (process.env.WORKER_MODE === 'true') {
      this.worker.run();
    }
  }

  async process(job: Job<ReminderJobData>): Promise<void> {
    this.logger.log(`Enviando recordatorio ${job.data.channel} de ${job.data.reservationId}`);

    await this.remindersService.send(job.data.tenantId, job.data.reservationId, job.data.channel);
  }
}
