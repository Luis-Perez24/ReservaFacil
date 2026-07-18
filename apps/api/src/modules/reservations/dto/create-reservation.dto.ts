import type { CreateReservationRequest } from '@reservafacil/contracts';
import {
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateReservationDto implements CreateReservationRequest {
  @IsUUID()
  serviceId!: string;

  /** Inicio del slot en ISO 8601 UTC: uno de los que devuelve `availability`. */
  @IsISO8601()
  startsAt!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  clientName!: string;

  @IsEmail()
  @MaxLength(255)
  clientEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  clientPhone?: string;
}
