import { ReservationStatus } from '@reservafacil/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * El núcleo. Referencia tenant, servicio y cliente por id —no con relaciones
 * TypeORM— para no cruzar la frontera entre módulos.
 */
@Entity('reservations')
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  /** `starts_at + duration_min`, calculado y guardado al reservar. */
  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ type: 'enum', enum: Object.values(ReservationStatus), enumName: 'reservation_status' })
  status!: ReservationStatus;

  /** Solo si `PENDING`: `now() + 10 min`. NULL en cualquier otro estado. */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  /** Copiado del servicio al reservar: si el precio sube, la reserva mantiene el suyo. */
  @Column({ name: 'price_clp', type: 'int' })
  priceClp!: number;

  @Column({ type: 'boolean', nullable: true })
  attended!: boolean | null;

  @Column({ name: 'cancelled_reason', type: 'text', nullable: true })
  cancelledReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
