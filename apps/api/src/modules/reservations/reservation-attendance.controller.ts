import { Body, Controller, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ReservationResponse } from '@reservafacil/contracts';
import { UserRole } from '@reservafacil/contracts';

import { CurrentTenant } from '../../shared/decorators/current-tenant.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { TenantGuard } from '../../shared/guards/tenant.guard';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { toResponse } from './reservations.controller';
import { ReservationsService } from './reservations.service';

/**
 * Acción de dashboard, separada de `reservations.controller.ts` (100% público,
 * sin auth) — mismo criterio que separa `public.controller.ts` de
 * `services.controller.ts` en `catalog`.
 */
@ApiTags('reservations')
@ApiBearerAuth()
@Controller('reservations')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class ReservationAttendanceController {
  constructor(private readonly reservationsService: ReservationsService) {}

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
