import type { ReminderChannel } from '@reservafacil/contracts';

/** Lo que un canal necesita para escribirle a alguien. */
export interface ReminderRecipient {
  clientName: string;
  email: string;
  phone: string | null;
}

/** El contenido del recordatorio, ya resuelto a texto — el canal no decide qué decir, solo cómo entregarlo. */
export interface ReminderMessage {
  tenantName: string;
  serviceName: string;
  /** Ya formateada en la zona horaria del negocio: "mañana 15:00", no un ISO en UTC. */
  whenLabel: string;
}

/**
 * El único puerto del proyecto (adr/0003): es la única dependencia externa
 * donde el cambio es real y previsible — hoy email, después lo que se decida.
 * Todo lo demás va directo contra Postgres, sin abstracción.
 */
export interface NotificationChannel {
  readonly channel: ReminderChannel;

  /** Si este canal puede escribirle a este destinatario ahora mismo. */
  isAvailableFor(recipient: ReminderRecipient): boolean;

  send(recipient: ReminderRecipient, message: ReminderMessage): Promise<void>;
}

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');
