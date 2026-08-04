import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ description: 'ID del servicio a reservar', format: 'uuid' })
  @IsUUID()
  serviceId!: string;

  /** Inicio del slot en ISO 8601 UTC: uno de los que devuelve `availability`. */
  @ApiProperty({ description: 'Inicio del slot en ISO 8601 UTC', example: '2026-07-27T10:00:00Z' })
  @IsISO8601()
  startsAt!: string;

  @ApiProperty({ description: 'Nombre del cliente', example: 'María González' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  clientName!: string;

  @ApiProperty({ description: 'Correo electrónico del cliente', example: 'maria@ejemplo.cl' })
  @IsEmail()
  @MaxLength(255)
  clientEmail!: string;

  @ApiPropertyOptional({ description: 'Teléfono del cliente', example: '+56912345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  clientPhone?: string;
}
