import type { ReminderChannel } from '@reservafacil/contracts';

export const REMINDERS_QUEUE = 'reminders';

export interface ReminderJobData {
  tenantId: string;
  reservationId: string;
  channel: ReminderChannel;
}
