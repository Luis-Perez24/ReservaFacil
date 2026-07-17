import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AvailabilityExceptionResponse,
  AvailabilityRuleResponse,
  UserRole,
} from '@reservafacil/contracts';

import { CurrentTenant } from '../../shared/decorators/current-tenant.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { TenantGuard } from '../../shared/guards/tenant.guard';
import { AvailabilityService } from './availability.service';
import { CreateAvailabilityExceptionDto } from './dto/create-availability-exception.dto';
import { CreateAvailabilityRuleDto } from './dto/create-availability-rule.dto';
import type { AvailabilityException } from './entities/availability-exception.entity';
import type { AvailabilityRule } from './entities/availability-rule.entity';

/** La BD hidrata time como 'HH:mm:ss'; hacia afuera va 'HH:mm'. */
function toShortTime(time: string): string {
  return time.slice(0, 5);
}

function ruleToResponse(rule: AvailabilityRule): AvailabilityRuleResponse {
  return {
    id: rule.id,
    dayOfWeek: rule.dayOfWeek,
    startTime: toShortTime(rule.startTime),
    endTime: toShortTime(rule.endTime),
    slotIntervalMin: rule.slotIntervalMin,
  };
}

function exceptionToResponse(exception: AvailabilityException): AvailabilityExceptionResponse {
  return {
    id: exception.id,
    date: exception.date,
    closed: exception.closed,
    startTime: exception.startTime ? toShortTime(exception.startTime) : null,
    endTime: exception.endTime ? toShortTime(exception.endTime) : null,
  };
}

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('availability')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(UserRole.OWNER)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post('rules')
  @ApiOperation({ summary: 'Crear regla semanal de horario' })
  async createRule(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateAvailabilityRuleDto,
  ): Promise<AvailabilityRuleResponse> {
    return ruleToResponse(await this.availabilityService.createRule(tenantId, dto));
  }

  @Get('rules')
  @ApiOperation({ summary: 'Listar reglas semanales' })
  async findAllRules(@CurrentTenant() tenantId: string): Promise<AvailabilityRuleResponse[]> {
    return (await this.availabilityService.findAllRules(tenantId)).map(ruleToResponse);
  }

  @Delete('rules/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar una regla' })
  async deleteRule(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.availabilityService.deleteRule(tenantId, id);
  }

  @Post('exceptions')
  @ApiOperation({ summary: 'Crear excepción (feriado o horario especial)' })
  async createException(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateAvailabilityExceptionDto,
  ): Promise<AvailabilityExceptionResponse> {
    return exceptionToResponse(await this.availabilityService.createException(tenantId, dto));
  }

  @Get('exceptions')
  @ApiOperation({ summary: 'Listar excepciones' })
  async findAllExceptions(
    @CurrentTenant() tenantId: string,
  ): Promise<AvailabilityExceptionResponse[]> {
    return (await this.availabilityService.findAllExceptions(tenantId)).map(exceptionToResponse);
  }

  @Delete('exceptions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar una excepción' })
  async deleteException(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.availabilityService.deleteException(tenantId, id);
  }
}
