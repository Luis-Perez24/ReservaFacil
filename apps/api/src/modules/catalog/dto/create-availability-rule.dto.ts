import type { CreateAvailabilityRuleRequest } from '@reservafacil/contracts';
import { IsInt, Matches, Max, Min } from 'class-validator';

/** 'HH:mm' de 24 horas. Los segundos no aportan en una grilla de reservas. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAvailabilityRuleDto implements CreateAvailabilityRuleRequest {
  /** 0=domingo … 6=sábado. */
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @Matches(TIME_PATTERN, { message: 'startTime debe ser HH:mm (24h)' })
  startTime!: string;

  @Matches(TIME_PATTERN, { message: 'endTime debe ser HH:mm (24h)' })
  endTime!: string;

  @IsInt()
  @Min(5)
  @Max(480)
  slotIntervalMin!: number;
}
