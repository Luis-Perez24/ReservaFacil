import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { PublicAvailabilityResponse } from '@reservafacil/contracts';
import { DateTime } from 'luxon';
import { DataSource, Repository } from 'typeorm';

import { isUniqueViolation } from '../../infra/db/unique-violation';
import { TenantsService } from '../tenants/tenants.service';
import type { CreateAvailabilityExceptionDto } from './dto/create-availability-exception.dto';
import type { CreateAvailabilityRuleDto } from './dto/create-availability-rule.dto';
import { AvailabilityException } from './entities/availability-exception.entity';
import { AvailabilityRule } from './entities/availability-rule.entity';
import { ServicesService } from './services.service';
import {
  computeFreeSlots,
  rangesOverlap,
  resolveDayWindows,
  timeToMinutes,
} from './slot-calculator';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(AvailabilityRule)
    private readonly rules: Repository<AvailabilityRule>,
    @InjectRepository(AvailabilityException)
    private readonly exceptions: Repository<AvailabilityException>,
    private readonly tenantsService: TenantsService,
    private readonly servicesService: ServicesService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Reglas semanales ──────────────────────────────────────────────────────

  async createRule(tenantId: string, dto: CreateAvailabilityRuleDto): Promise<AvailabilityRule> {
    if (timeToMinutes(dto.endTime) <= timeToMinutes(dto.startTime)) {
      throw new BadRequestException('endTime debe ser mayor que startTime');
    }

    // Dos reglas del mismo día no pueden solaparse: producirían slots duplicados.
    const sameDay = await this.rules.find({ where: { tenantId, dayOfWeek: dto.dayOfWeek } });
    const overlapping = sameDay.find((rule) =>
      rangesOverlap(
        timeToMinutes(dto.startTime),
        timeToMinutes(dto.endTime),
        timeToMinutes(rule.startTime),
        timeToMinutes(rule.endTime),
      ),
    );

    if (overlapping) {
      throw new ConflictException(
        `Se solapa con la regla existente ${overlapping.startTime.slice(0, 5)}–${overlapping.endTime.slice(0, 5)}`,
      );
    }

    return this.rules.save(this.rules.create({ ...dto, tenantId }));
  }

  async findAllRules(tenantId: string): Promise<AvailabilityRule[]> {
    return this.rules.find({
      where: { tenantId },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  async deleteRule(tenantId: string, id: string): Promise<void> {
    const result = await this.rules.delete({ id, tenantId });

    if (result.affected === 0) {
      throw new NotFoundException('Regla no encontrada');
    }
  }

  // ── Excepciones ───────────────────────────────────────────────────────────

  async createException(
    tenantId: string,
    dto: CreateAvailabilityExceptionDto,
  ): Promise<AvailabilityException> {
    if (!DateTime.fromISO(dto.date).isValid) {
      throw new BadRequestException(`"${dto.date}" no es una fecha real`);
    }

    if (dto.closed) {
      if (dto.startTime || dto.endTime) {
        throw new BadRequestException('Un día cerrado no lleva horario');
      }
    } else {
      if (!dto.startTime || !dto.endTime) {
        throw new BadRequestException('Un horario especial requiere startTime y endTime');
      }
      if (timeToMinutes(dto.endTime) <= timeToMinutes(dto.startTime)) {
        throw new BadRequestException('endTime debe ser mayor que startTime');
      }
    }

    try {
      return await this.exceptions.save(
        this.exceptions.create({
          tenantId,
          date: dto.date,
          closed: dto.closed,
          startTime: dto.startTime ?? null,
          endTime: dto.endTime ?? null,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error, 'uq_availability_exceptions_tenant_date')) {
        throw new ConflictException(`Ya existe una excepción para ${dto.date}`);
      }
      throw error;
    }
  }

  async findAllExceptions(tenantId: string): Promise<AvailabilityException[]> {
    return this.exceptions.find({ where: { tenantId }, order: { date: 'ASC' } });
  }

  async deleteException(tenantId: string, id: string): Promise<void> {
    const result = await this.exceptions.delete({ id, tenantId });

    if (result.affected === 0) {
      throw new NotFoundException('Excepción no encontrada');
    }
  }

  // ── Disponibilidad pública ────────────────────────────────────────────────

  /**
   * reglas − excepciones − reservas activas, para un día y servicio.
   * El tenant llega resuelto desde el slug público: acá no hay JWT.
   */
  async getPublicAvailability(
    slug: string,
    serviceId: string,
    date: string,
  ): Promise<PublicAvailabilityResponse> {
    const tenant = await this.tenantsService.findBySlug(slug);

    if (!tenant || !tenant.active) {
      throw new NotFoundException('Negocio no encontrado');
    }

    const day = DateTime.fromISO(date, { zone: tenant.timezone });

    if (!day.isValid) {
      throw new BadRequestException(`"${date}" no es una fecha real`);
    }

    const service = await this.servicesService.findActiveOne(tenant.id, serviceId);

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    // Luxon: lunes=1 … domingo=7. La BD usa domingo=0 … sábado=6.
    const dayOfWeek = day.weekday % 7;

    const [rules, exception] = await Promise.all([
      this.rules.find({ where: { tenantId: tenant.id, dayOfWeek } }),
      this.exceptions.findOne({ where: { tenantId: tenant.id, date } }),
    ]);

    const windows = resolveDayWindows(rules, exception, service.durationMin);

    const dayStart = day.startOf('day');
    const busy = await this.findBusyRanges(
      tenant.id,
      serviceId,
      dayStart.toJSDate(),
      dayStart.plus({ days: 1 }).toJSDate(),
    );

    const slots = computeFreeSlots({
      date,
      timezone: tenant.timezone,
      durationMin: service.durationMin,
      windows,
      busy,
      now: new Date(),
    });

    return {
      serviceId,
      date,
      timezone: tenant.timezone,
      slots: slots.map((slot) => ({
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      })),
    };
  }

  /**
   * Lee la tabla `reservations` directo, no el módulo `reservations`: la
   * dirección permitida es reservations → catalog y un import del módulo la
   * invertiría. Misma definición de "activa" que usa el lock del núcleo:
   * PAID, CONFIRMED, o PENDING aún no expirada — una PENDING vencida es un
   * slot libre (regla #2 del proyecto).
   */
  private async findBusyRanges(
    tenantId: string,
    serviceId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ startsAt: Date; endsAt: Date }>> {
    const rows: Array<{ starts_at: Date; ends_at: Date }> = await this.dataSource.query(
      `SELECT starts_at, ends_at
         FROM reservations
        WHERE tenant_id = $1
          AND service_id = $2
          AND starts_at < $3
          AND ends_at > $4
          AND ( status IN ('PAID', 'CONFIRMED')
                OR (status = 'PENDING' AND expires_at > now()) )`,
      [tenantId, serviceId, to, from],
    );

    return rows.map((row) => ({ startsAt: row.starts_at, endsAt: row.ends_at }));
  }
}
