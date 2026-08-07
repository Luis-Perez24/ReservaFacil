import { ApiProperty } from '@nestjs/swagger';
import type { MarkAttendanceRequest } from '@reservafacil/contracts';
import { IsBoolean } from 'class-validator';

export class MarkAttendanceDto implements MarkAttendanceRequest {
  @ApiProperty({ description: 'Si el cliente llegó a su hora', example: true })
  @IsBoolean()
  attended!: boolean;
}
