import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

import { DATE_PATTERN } from '../../catalog/dto/create-availability-exception.dto';

export class ListReservationsQueryDto {
  @ApiProperty({ description: 'Desde (inclusive), fecha local del negocio', example: '2026-08-01' })
  @Matches(DATE_PATTERN, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @ApiProperty({ description: 'Hasta (inclusive), fecha local del negocio', example: '2026-08-31' })
  @Matches(DATE_PATTERN, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;
}
