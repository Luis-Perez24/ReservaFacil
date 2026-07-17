import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicAvailabilityResponse, PublicServiceResponse } from '@reservafacil/contracts';

import { TenantsService } from '../tenants/tenants.service';
import { AvailabilityService } from './availability.service';
import { PublicAvailabilityQueryDto } from './dto/public-availability-query.dto';
import { ServicesService } from './services.service';

/**
 * La cara pública del negocio: sin auth, el tenant sale del slug de la URL.
 * Solo lectura y solo datos que cualquier visitante puede ver.
 */
@ApiTags('public')
@Controller('public/:slug')
export class PublicController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly servicesService: ServicesService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  @Get('services')
  @ApiOperation({ summary: 'Servicios activos del negocio' })
  async findServices(@Param('slug') slug: string): Promise<PublicServiceResponse[]> {
    const tenant = await this.tenantsService.findBySlug(slug);

    if (!tenant || !tenant.active) {
      throw new NotFoundException('Negocio no encontrado');
    }

    const services = await this.servicesService.findAllActive(tenant.id);

    return services.map((service) => ({
      id: service.id,
      name: service.name,
      durationMin: service.durationMin,
      priceClp: service.priceClp,
    }));
  }

  @Get('availability')
  @ApiOperation({ summary: 'Slots libres de un servicio para un día' })
  async findAvailability(
    @Param('slug') slug: string,
    @Query() query: PublicAvailabilityQueryDto,
  ): Promise<PublicAvailabilityResponse> {
    return this.availabilityService.getPublicAvailability(slug, query.serviceId, query.date);
  }
}
