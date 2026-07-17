import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServiceResponse, UserRole } from '@reservafacil/contracts';

import { CurrentTenant } from '../../shared/decorators/current-tenant.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { TenantGuard } from '../../shared/guards/tenant.guard';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import type { Service } from './entities/service.entity';
import { ServicesService } from './services.service';

function toResponse(service: Service): ServiceResponse {
  return {
    id: service.id,
    name: service.name,
    durationMin: service.durationMin,
    priceClp: service.priceClp,
    active: service.active,
  };
}

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('services')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Crear un servicio' })
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateServiceDto,
  ): Promise<ServiceResponse> {
    return toResponse(await this.servicesService.create(tenantId, dto));
  }

  /** STAFF también lee: la agenda necesita nombres y duraciones. Escribir es de OWNER. */
  @Get()
  @Roles(UserRole.OWNER, UserRole.STAFF)
  @ApiOperation({ summary: 'Listar servicios del negocio (incluye inactivos)' })
  async findAll(@CurrentTenant() tenantId: string): Promise<ServiceResponse[]> {
    return (await this.servicesService.findAll(tenantId)).map(toResponse);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Editar un servicio' })
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ): Promise<ServiceResponse> {
    return toResponse(await this.servicesService.update(tenantId, id, dto));
  }

  @Delete(':id')
  @Roles(UserRole.OWNER)
  @HttpCode(204)
  @ApiOperation({ summary: 'Desactivar un servicio (soft delete)' })
  async deactivate(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.servicesService.deactivate(tenantId, id);
  }
}
