import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DateTime } from 'luxon';
import { Queue } from 'bullmq';

import {
  RESERVATION_CONFIRMED_EVENT,
  ReservationConfirmedEvent,
} from '../reservations/reservations.service';
import { RemindersService } from './reminders.service';
import { REMINDERS_QUEUE, ReminderJobData } from './reminders.queue';

/** Cuánto antes de la hora se manda el recordatorio (flujo crítico 3, `02-arquitectura.md`). */
const HOURS_BEFORE = 24;

@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(
    @InjectQueue(REMINDERS_QUEUE) private readonly queue: Queue<ReminderJobData>,
    private readonly remindersService: RemindersService,
  ) {}

  @OnEvent(RESERVATION_CONFIRMED_EVENT)
  async handleReservationConfirmed(event: ReservationConfirmedEvent): Promise<void> {
    const startsAt = DateTime.fromJSDate(event.startsAt);
    const scheduledFor = startsAt.minus({ hours: HOURS_BEFORE });
    const delayMs = scheduledFor.diffNow('milliseconds').milliseconds;

    // Si la hora ya pasó, no hay nada que recordar.
    if (startsAt <= DateTime.now()) {
      return;
    }

    const recipient = await this.remindersService.loadRecipient(event.clientId);

    if (!recipient) {
      this.logger.warn(`Cliente ${event.clientId} no encontrado: no se programa recordatorio`);
      return;
    }

    const channels = await this.remindersService.resolveChannels(recipient);

    for (const channel of channels) {
      await this.queue.add(
        'send-reminder',
        { tenantId: event.tenantId, reservationId: event.reservationId, channel },
        {
          // Reserva con menos de 24h: se manda apenas se pueda, no se descarta.
          delay: Math.max(delayMs, 0),
          // BullMQ ya no encola dos veces un jobId existente: idempotencia
          // gratis a nivel de cola, además de la fila en `reminders`. Sin ':'
          // -BullMQ lo usa como separador interno de sus claves de Redis y
          // rechaza un jobId que lo contenga.
          jobId: `${event.reservationId}-${channel}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    }
  }
}
