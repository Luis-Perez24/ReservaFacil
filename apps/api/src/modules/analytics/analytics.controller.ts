import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DailyMetricResponse, ServiceMetricResponse } from '@reservafacil/contracts';
import { UserRole } from '@reservafacil/contracts';

import { CurrentTenant } from '../../shared/decorators/current-tenant.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { TenantGuard } from '../../shared/guards/tenant.guard';
import { AnalyticsService } from './analytics.service';
import { DailyMetricsQueryDto } from './dto/daily-metrics-query.dto';
import { TopServicesQueryDto } from './dto/top-services-query.dto';

/** STAFF también lee: necesita ver cómo le está yendo al negocio, igual que con `services`. */
@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(UserRole.OWNER, UserRole.STAFF)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('daily')
  @ApiOperation({ summary: 'Métricas diarias (ocupación, ingresos, no-show) en un rango de fechas' })
  async daily(
    @CurrentTenant() tenantId: string,
    @Query() query: DailyMetricsQueryDto,
  ): Promise<DailyMetricResponse[]> {
    return this.analyticsService.getDaily(tenantId, query.from, query.to);
  }

  @Get('services/top')
  @ApiOperation({ summary: 'Ranking de servicios por ingresos' })
  async topServices(
    @CurrentTenant() tenantId: string,
    @Query() query: TopServicesQueryDto,
  ): Promise<ServiceMetricResponse[]> {
    return this.analyticsService.getTopServices(tenantId, query.limit);
  }
}
