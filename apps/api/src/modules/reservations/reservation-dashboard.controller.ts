import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ReservationAgendaResponse, ReservationResponse } from '@reservafacil/contracts';
import { UserRole } from '@reservafacil/contracts';

import { CurrentTenant } from '../../shared/decorators/current-tenant.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { TenantGuard } from '../../shared/guards/tenant.guard';
import { ListReservationsQueryDto } from './dto/list-reservations-query.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { toResponse } from './reservations.controller';
import { ReservationsService } from './reservations.service';

/**
 * Acciones de dashboard sobre reservas, separadas de `reservations.controller.ts`
 * (100% público, sin auth) — mismo criterio que separa `public.controller.ts` de
 * `services.controller.ts` en `catalog`.
 */
@ApiTags('reservations')
@ApiBearerAuth()
@Controller('reservations')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class ReservationDashboardController {
  constructor(private readonly reservationsService: ReservationsService) {}

  /** STAFF también atiende clientes, así que también puede ver la agenda. */
  @Get()
  @Roles(UserRole.OWNER, UserRole.STAFF)
  @ApiOperation({ summary: 'Listar reservas del negocio en un rango de fechas (agenda)' })
  async findAgenda(
    @CurrentTenant() tenantId: string,
    @Query() query: ListReservationsQueryDto,
  ): Promise<ReservationAgendaResponse[]> {
    return this.reservationsService.findAgenda(tenantId, query.from, query.to);
  }

  /** STAFF también atiende clientes, así que también puede marcar asistencia. */
  @Patch(':id/attendance')
  @Roles(UserRole.OWNER, UserRole.STAFF)
  @ApiOperation({ summary: 'Marcar si el cliente llegó a una reserva ya confirmada y pasada' })
  async markAttendance(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkAttendanceDto,
  ): Promise<ReservationResponse> {
    return toResponse(await this.reservationsService.markAttendance(tenantId, id, dto.attended));
  }
}
