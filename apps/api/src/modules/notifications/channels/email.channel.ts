import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReminderChannel } from '@reservafacil/contracts';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import type { EnvironmentVariables } from '../../../infra/config/env.validation';
import type {
  NotificationChannel,
  ReminderMessage,
  ReminderRecipient,
} from './notification-channel';

/**
 * SMTP real, igual que Webpay usa su ambiente de integración: protocolo real
 * contra un destino seguro. En desarrollo `SMTP_HOST` apunta a Mailpit
 * (docker-compose, sin credenciales); en producción, a un proveedor real vía
 * las mismas variables — el código no cambia entre uno y otro.
 */
@Injectable()
export class EmailChannel implements NotificationChannel, OnModuleDestroy {
  readonly channel = ReminderChannel.EMAIL;

  private readonly logger = new Logger(EmailChannel.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.from = config.get('SMTP_FROM', { infer: true });

    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      // Mailpit no pide autenticación: sin usuario, nodemailer manda sin AUTH.
      auth: config.get('SMTP_USER', { infer: true })
        ? {
            user: config.get('SMTP_USER', { infer: true }),
            pass: config.get('SMTP_PASSWORD', { infer: true }),
          }
        : undefined,
    });
  }

  /** Todo cliente da un email al reservar (`CreateReservationDto.clientEmail` es obligatorio). */
  isAvailableFor(recipient: ReminderRecipient): boolean {
    return Boolean(recipient.email);
  }

  async send(recipient: ReminderRecipient, message: ReminderMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: recipient.email,
      subject: `Recordatorio: tu hora en ${message.tenantName}`,
      text:
        `Hola ${recipient.clientName},\n\n` +
        `Te recordamos tu hora de ${message.serviceName} en ${message.tenantName}, ` +
        `${message.whenLabel}.\n\n` +
        `Si no puedes venir, avísale al negocio para liberar el horario.`,
    });

    this.logger.log(`Recordatorio enviado por email a ${recipient.email}`);
  }

  async onModuleDestroy(): Promise<void> {
    this.transporter.close();
  }
}
