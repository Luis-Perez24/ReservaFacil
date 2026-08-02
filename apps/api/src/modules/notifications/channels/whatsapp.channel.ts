import { Injectable } from '@nestjs/common';
import { ReminderChannel } from '@reservafacil/contracts';

import type {
  NotificationChannel,
  ReminderMessage,
  ReminderRecipient,
} from './notification-channel';

/**
 * Implementado detrás de la interfaz, apagado por config (adr/0003): la
 * WhatsApp Business API cobra por conversación y pide número verificado, así
 * que no se activa hasta que exista un negocio real dispuesto a pagarla.
 * `isAvailableFor` devuelve `false` siempre que esté apagado, así que nunca lo
 * elige `RemindersService.resolveChannels()` — cero llamadas, cero costo.
 *
 * `NOTIFICATIONS_WHATSAPP_ENABLED` se lee crudo de `process.env`, no del
 * `ConfigService` tipado: es un interruptor de despliegue, no un secreto que
 * deba tumbar el arranque si falta — mismo precedente que `RUN_MIGRATIONS`
 * en el entrypoint de Docker.
 */
@Injectable()
export class WhatsappChannel implements NotificationChannel {
  readonly channel = ReminderChannel.WHATSAPP;

  isAvailableFor(): boolean {
    return process.env.NOTIFICATIONS_WHATSAPP_ENABLED === 'true';
  }

  send(_recipient: ReminderRecipient, _message: ReminderMessage): Promise<void> {
    throw new Error('El canal WhatsApp no está activo (adr/0003)');
  }
}
