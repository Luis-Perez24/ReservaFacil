import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { RegisterBusinessRequest } from '@reservafacil/contracts';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Minúsculas, números y guiones simples. Es la URL pública del negocio. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class RegisterBusinessDto implements RegisterBusinessRequest {
  @ApiProperty({ description: 'Nombre comercial del negocio', example: 'Barbería Don Lucho' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  businessName!: string;

  @ApiProperty({
    description: 'Identificador del negocio en la URL pública: minúsculas, números y guiones',
    example: 'barberia-don-lucho',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(SLUG_PATTERN, {
    message: 'slug solo admite minúsculas, números y guiones (ej: barberia-don-lucho)',
  })
  slug!: string;

  @ApiPropertyOptional({
    description: 'Zona horaria IANA en que el negocio publica sus horarios',
    example: 'America/Santiago',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  timezone?: string;

  @ApiProperty({ description: 'Nombre completo del dueño', example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  ownerFullName!: string;

  @ApiProperty({ description: 'Correo electrónico del dueño', example: 'juan@barberia.cl' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ description: 'Contraseña del dueño', example: 'MiClaveSegura123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
