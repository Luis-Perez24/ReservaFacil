import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import type { UpdateServiceRequest } from '@reservafacil/contracts';
import { IsBoolean, IsOptional } from 'class-validator';

import { CreateServiceDto } from './create-service.dto';

export class UpdateServiceDto extends PartialType(CreateServiceDto) implements UpdateServiceRequest {
  /** Permite reactivar un servicio desactivado (el DELETE es soft). */
  @ApiPropertyOptional({ description: 'Estado activo del servicio', example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
