import { PaymentStatus } from '@reservafacil/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Un intento de pago. Una reserva puede tener varios: el intento 1 rechazado y
 * el 2 aprobado. Referencia tenant y reserva por id, sin relaciones TypeORM,
 * para no cruzar la frontera entre módulos.
 */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'reservation_id', type: 'uuid' })
  reservationId!: string;

  /**
   * La clave de idempotencia frente a Webpay. Único en la tabla: un segundo
   * commit del mismo `buy_order` se resuelve leyendo esta fila, sin volver a
   * cobrar. Webpay lo limita a 26 caracteres (`BUY_ORDER_LENGTH` del SDK).
   */
  @Column({ name: 'buy_order', type: 'text' })
  buyOrder!: string;

  /** Token que devuelve Webpay al crear la transacción. NULL hasta tenerlo. */
  @Column({ name: 'token_ws', type: 'text', nullable: true })
  tokenWs!: string | null;

  @Column({ name: 'amount_clp', type: 'int' })
  amountClp!: number;

  @Column({ type: 'enum', enum: Object.values(PaymentStatus), enumName: 'payment_status' })
  status!: PaymentStatus;

  /** 1, 2, 3… Forma parte del `buy_order` para que cada intento sea único. */
  @Column({ type: 'int' })
  attempt!: number;

  /**
   * Respuesta cruda de Transbank. Cuando algo falle en producción, es la única
   * fuente de verdad: se guarda siempre, aprobado o no.
   */
  @Column({ name: 'raw_response', type: 'jsonb', nullable: true })
  rawResponse!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
