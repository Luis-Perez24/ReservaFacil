import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ReservationStatus } from '@reservafacil/contracts';
import { DateTime } from 'luxon';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { isUniqueViolation } from '../../infra/db/unique-violation';
import { AvailabilityService } from '../catalog/availability.service';
import { TenantsService } from '../tenants/tenants.service';
import type { CreateReservationDto } from './dto/create-reservation.dto';
import { Reservation } from './entities/reservation.entity';

/** Retención del slot mientras el cliente paga. Ver regla #2 y `adr/0002`. */
const HOLD_MINUTES = 10;

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservations: Repository<Reservation>,
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  /**
   * El corazón del proyecto (`adr/0002`). Crea una reserva `PENDING` con una
   * retención de 10 min, garantizando que nunca haya dos reservas activas
   * solapadas para el mismo tenant y servicio.
   *
   * Tres capas de defensa, dentro de una transacción:
   *   1. `FOR UPDATE` sobre la fila del servicio → serializa las reservas de ese
   *      servicio. Sin esto, dos inserciones nuevas con solape parcial (distinto
   *      `starts_at`) no se ven entre sí y ninguna capa las atrapa.
   *   2. `FOR UPDATE` sobre las reservas activas que se solapan por rango → un
   *      `PENDING` expirado no cuenta como activo, se trata como libre (regla #2).
   *   3. Índice único parcial `uq_reservation_active_slot` → la red por si la
   *      lógica fallara; su violación se traduce a un `409`.
   */
  async create(slug: string, dto: CreateReservationDto): Promise<Reservation> {
    const tenant = await this.tenantsService.findBySlug(slug);

    if (!tenant || !tenant.active) {
      throw new NotFoundException('Negocio no encontrado');
    }

    const startsAt = new Date(dto.startsAt);

    // El slot pedido tiene que ser uno que el negocio realmente ofrece: dentro de
    // horario, alineado a la grilla y futuro. Reusa el cálculo ya probado del
    // catálogo. Es lectura y va fuera de la transacción; la autoridad de la
    // contención es el lock de más abajo, no esto.
    await this.assertSlotIsBookable(slug, dto.serviceId, tenant.timezone, startsAt);

    return this.dataSource.transaction(async (manager) => {
      // Capa 1: lockea la fila del servicio y de paso trae duración y precio.
      const [service]: Array<{ duration_min: number; price_clp: number }> = await manager.query(
        `SELECT duration_min, price_clp
           FROM services
          WHERE id = $1 AND tenant_id = $2 AND active = true
          FOR UPDATE`,
        [dto.serviceId, tenant.id],
      );

      if (!service) {
        throw new NotFoundException('Servicio no encontrado');
      }

      const endsAt = new Date(startsAt.getTime() + service.duration_min * 60_000);
      const clientId = await this.findOrCreateClient(manager, dto);

      // Capa 2: el lock del ADR. Un PENDING expirado no aparece → slot libre.
      const conflicting: Array<{ id: string }> = await manager.query(
        `SELECT id
           FROM reservations
          WHERE tenant_id = $1 AND service_id = $2
            AND starts_at < $3 AND ends_at > $4
            AND ( status IN ('PAID', 'CONFIRMED')
                  OR (status = 'PENDING' AND expires_at > now()) )
          FOR UPDATE`,
        [tenant.id, dto.serviceId, endsAt, startsAt],
      );

      if (conflicting.length > 0) {
        throw new ConflictException('Ese horario ya fue tomado');
      }

      // Expiración perezosa. El índice único `uq_reservation_active_slot` cuenta
      // como activo cualquier PENDING —su predicado no puede mirar `expires_at`,
      // que no es IMMUTABLE—, así que un hold vencido en el MISMO `starts_at`
      // haría fallar el INSERT de abajo y devolvería un 409 falso (rompiendo la
      // regla #2). Ya con el servicio bloqueado, se transiciona a EXPIRED los
      // holds vencidos que se solapan: converge al mismo estado que el job de
      // expiración del día 9 (idempotente) y los saca del índice.
      await manager.query(
        `UPDATE reservations
            SET status = 'EXPIRED', updated_at = now()
          WHERE tenant_id = $1 AND service_id = $2
            AND status = 'PENDING' AND expires_at <= now()
            AND starts_at < $3 AND ends_at > $4`,
        [tenant.id, dto.serviceId, endsAt, startsAt],
      );

      // `expires_at` se ancla al reloj de la BD: el mismo que usan todas las
      // comparaciones `expires_at > now()`. Un solo reloj, cero skew.
      let inserted: Array<{ id: string; starts_at: Date; ends_at: Date; expires_at: Date }>;
      try {
        inserted = await manager.query(
          `INSERT INTO reservations
             (tenant_id, service_id, client_id, starts_at, ends_at, status, expires_at, price_clp)
           VALUES ($1, $2, $3, $4, $5, 'PENDING', now() + ($6 || ' minutes')::interval, $7)
           RETURNING id, starts_at, ends_at, expires_at`,
          [tenant.id, dto.serviceId, clientId, startsAt, endsAt, HOLD_MINUTES, service.price_clp],
        );
      } catch (error) {
        // Capa 3: la red. Si el lock fallara, el índice único es el último muro.
        if (isUniqueViolation(error, 'uq_reservation_active_slot')) {
          throw new ConflictException('Ese horario ya fue tomado');
        }
        throw error;
      }

      const row = inserted[0];

      return this.reservations.create({
        id: row.id,
        tenantId: tenant.id,
        serviceId: dto.serviceId,
        clientId,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: ReservationStatus.PENDING,
        expiresAt: row.expires_at,
        priceClp: service.price_clp,
      });
    });
  }

  async findById(tenantId: string, id: string): Promise<Reservation | null> {
    return this.reservations.findOne({ where: { id, tenantId } });
  }

  private async assertSlotIsBookable(
    slug: string,
    serviceId: string,
    timezone: string,
    startsAt: Date,
  ): Promise<void> {
    const date = DateTime.fromJSDate(startsAt, { zone: timezone }).toISODate();

    if (!date) {
      throw new BadRequestException(`"${startsAt.toISOString()}" no es una fecha real`);
    }

    // Lanza 404 si el servicio no existe o está inactivo (lógica del catálogo).
    const availability = await this.availabilityService.getPublicAvailability(
      slug,
      serviceId,
      date,
    );

    const isFreeSlot = availability.slots.some(
      (slot) => new Date(slot.startsAt).getTime() === startsAt.getTime(),
    );

    if (!isFreeSlot) {
      throw new ConflictException('Ese horario no está disponible');
    }
  }

  /**
   * El cliente que reserva no tiene cuenta ni contraseña: la página pública solo
   * pide nombre, email y teléfono. Se accede a `users` por SQL —no importando el
   * módulo auth— porque `reservations → auth` no es una dirección permitida; es el
   * mismo precedente que `catalog/availability.service.ts` con la tabla `reservations`.
   *
   * `INSERT … ON CONFLICT` es atómico: cierra la ventana de dos reservas del mismo
   * cliente nuevo en paralelo. Va con `tenant_id = NULL` (un cliente es global,
   * reutilizable entre negocios) y `password_hash = ''`: el login del dashboard
   * solo consulta usuarios con `tenant_id NOT NULL`, así que ese hash vacío nunca
   * llega al `verify` de contraseña.
   */
  private async findOrCreateClient(
    manager: EntityManager,
    dto: CreateReservationDto,
  ): Promise<string> {
    const [client]: Array<{ id: string }> = await manager.query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, phone, role)
       VALUES (NULL, $1, '', $2, $3, 'CLIENT')
       ON CONFLICT (tenant_id, email)
         DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, updated_at = now()
       RETURNING id`,
      [dto.clientEmail, dto.clientName, dto.clientPhone ?? null],
    );

    return client.id;
  }
}
