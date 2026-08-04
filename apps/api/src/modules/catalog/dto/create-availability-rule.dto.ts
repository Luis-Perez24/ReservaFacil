import { ApiProperty } from '@nestjs/swagger';
import type { CreateAvailabilityRuleRequest } from '@reservafacil/contracts';
import { IsInt, Matches, Max, Min } from 'class-validator';

/** 'HH:mm' de 24 horas. Los segundos no aportan en una grilla de reservas. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAvailabilityRuleDto implements CreateAvailabilityRuleRequest {
  /** 0=domingo … 6=sábado. */
  @ApiProperty({ description: 'Día de la semana (0=domingo … 6=sábado)', example: 1, minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ description: 'Hora de inicio del horario', example: '09:00' })
  @Matches(TIME_PATTERN, { message: 'startTime debe ser HH:mm (24h)' })
  startTime!: string;

  @ApiProperty({ description: 'Hora de término del horario', example: '18:00' })
  @Matches(TIME_PATTERN, { message: 'endTime debe ser HH:mm (24h)' })
  endTime!: string;

  @ApiProperty({
    description: 'Intervalo mínimo entre slots (minutos)',
    example: 30,
    minimum: 5,
    maximum: 480,
  })
  @IsInt()
  @Min(5)
  @Max(480)
  slotIntervalMin!: number;
}
