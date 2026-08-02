import { ReminderChannel, ReminderStatus } from '@reservafacil/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Un intento de recordatorio por canal. Referencia tenant y reserva por id,
 * sin relaciones TypeORM, para no cruzar la frontera entre módulos.
 *
 * `UNIQUE (reservation_id, channel)` es la idempotencia del envío: la fila se
 * inserta en PENDING antes de mandar, así que un reintento tras un worker que
 * murió a medio envío choca con el índice en vez de mandar dos veces (adr/0003).
 */
@Entity('reminders')
export class Reminder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'reservation_id', type: 'uuid' })
  reservationId!: string;

  @Column({ type: 'enum', enum: Object.values(ReminderChannel), enumName: 'reminder_channel' })
  channel!: ReminderChannel;

  @Column({ type: 'enum', enum: Object.values(ReminderStatus), enumName: 'reminder_status' })
  status!: ReminderStatus;

  @Column({ name: 'scheduled_for', type: 'timestamptz' })
  scheduledFor!: Date;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
