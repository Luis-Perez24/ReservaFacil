import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ReminderChannel, ReminderStatus } from '@reservafacil/contracts';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';

import { AuthService } from '../auth/auth.service';
import { ServicesService } from '../catalog/services.service';
import { ReservationsService } from '../reservations/reservations.service';
import { TenantsService } from '../tenants/tenants.service';
import { EmailChannel } from './channels/email.channel';
import type { NotificationChannel, ReminderRecipient } from './channels/notification-channel';
import { WhatsappChannel } from './channels/whatsapp.channel';
import { Reminder } from './entities/reminder.entity';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  private readonly channels: NotificationChannel[];

  constructor(
    @InjectRepository(Reminder)
    private readonly reminders: Repository<Reminder>,
    private readonly reservationsService: ReservationsService,
    private readonly tenantsService: TenantsService,
    private readonly servicesService: ServicesService,
    private readonly authService: AuthService,
    emailChannel: EmailChannel,
    whatsappChannel: WhatsappChannel,
  ) {
    this.channels = [emailChannel, whatsappChannel];
  }

  /** Qué canales le sirven a esta reserva ahora mismo: los que están activos y tienen a quién escribirle. */
  async resolveChannels(recipient: ReminderRecipient): Promise<ReminderChannel[]> {
    return this.channels.filter((ch) => ch.isAvailableFor(recipient)).map((ch) => ch.channel);
  }

  async loadRecipient(clientId: string): Promise<ReminderRecipient | null> {
    const contact = await this.authService.findContact(clientId);

    if (!contact) {
      return null;
    }

    return { clientName: contact.fullName, email: contact.email, phone: contact.phone };
  }

  /**
   * Envía un recordatorio, con la idempotencia de `adr/0003`: la fila se
   * inserta en PENDING **antes** de mandar, con `ON CONFLICT DO NOTHING`
   * sobre `(reservation_id, channel)`. Si ya existe y quedó en SENT, no
   * vuelve a mandar — así un reintento tras un worker que murió a medio
   * envío no manda dos veces.
   *
   * Ventana honesta: si el worker muere justo entre "el envío tuvo éxito" y
   * "se guardó SENT", un reintento sí manda dos. Es el mismo trade-off
   * *at-least-once* que acepta cualquier cola de trabajo; cerrarlo del todo
   * pediría un outbox transaccional, que es más máquina de la que un
   * recordatorio por email necesita.
   */
  async send(tenantId: string, reservationId: string, channel: ReminderChannel): Promise<void> {
    // Con tenant_id explícito, no una búsqueda global (regla #1): un
    // reservationId adivinado no sirve para escribirle a otro negocio.
    const reservation = await this.reservationsService.findById(tenantId, reservationId);

    if (!reservation) {
      this.logger.warn(`Reserva ${reservationId} ya no existe: se descarta el recordatorio`);
      return;
    }

    // La reserva pudo cancelarse entre que se encoló el job y que se disparó
    // (hasta 24h después). Solo se recuerda lo que sigue en pie.
    if (reservation.status !== 'CONFIRMED') {
      this.logger.log(
        `Reserva ${reservationId} ya no está CONFIRMED (${reservation.status}): se descarta`,
      );
      return;
    }

    const recipient = await this.loadRecipient(reservation.clientId);

    if (!recipient) {
      this.logger.warn(`Cliente de la reserva ${reservationId} ya no existe`);
      return;
    }

    const notifier = this.channels.find((ch) => ch.channel === channel);

    if (!notifier || !notifier.isAvailableFor(recipient)) {
      this.logger.warn(`Canal ${channel} no disponible para la reserva ${reservationId}`);
      return;
    }

    const reminder = await this.insertPendingOrGet(reservation.tenantId, reservationId, channel);

    if (reminder.status === ReminderStatus.SENT) {
      this.logger.log(`Recordatorio ${channel} de ${reservationId} ya se había enviado`);
      return;
    }

    const [tenant, service] = await Promise.all([
      this.tenantsService.findById(reservation.tenantId),
      this.servicesService.findOne(reservation.tenantId, reservation.serviceId),
    ]);

    if (!tenant) {
      this.logger.warn(`Negocio de la reserva ${reservationId} ya no existe`);
      return;
    }

    const whenLabel = DateTime.fromJSDate(reservation.startsAt)
      .setZone(tenant.timezone)
      .setLocale('es-CL')
      .toFormat("cccc d 'de' LLLL 'a las' HH:mm");

    try {
      await notifier.send(recipient, { tenantName: tenant.name, serviceName: service.name, whenLabel });
      await this.reminders.update(reminder.id, { status: ReminderStatus.SENT, sentAt: new Date() });
    } catch (error) {
      await this.reminders.update(reminder.id, {
        status: ReminderStatus.FAILED,
        attempts: reminder.attempts + 1,
        lastError: error instanceof Error ? error.message : String(error),
      });
      // BullMQ reintenta con el backoff configurado en la cola (adr/0003).
      throw error;
    }
  }

  private async insertPendingOrGet(
    tenantId: string,
    reservationId: string,
    channel: ReminderChannel,
  ): Promise<Reminder> {
    await this.reminders
      .createQueryBuilder()
      .insert()
      .values({
        tenantId,
        reservationId,
        channel,
        status: ReminderStatus.PENDING,
        scheduledFor: new Date(),
        attempts: 0,
      })
      .orIgnore()
      .execute();

    const reminder = await this.reminders.findOneByOrFail({ reservationId, channel });

    return reminder;
  }
}
