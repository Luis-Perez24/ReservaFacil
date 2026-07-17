import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Regla semanal de atención. Los slots NO se guardan: se calculan a partir de
 * estas reglas, menos excepciones, menos reservas activas (ver 03-modelo-datos).
 */
@Entity('availability_rules')
export class AvailabilityRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** 0=domingo … 6=sábado. */
  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek!: number;

  /** Hora local del negocio ('HH:mm:ss' al hidratar). La zona vive en tenants.timezone. */
  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;

  @Column({ name: 'slot_interval_min', type: 'int' })
  slotIntervalMin!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
