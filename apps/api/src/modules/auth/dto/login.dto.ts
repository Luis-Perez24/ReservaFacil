import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LoginRequest } from '@reservafacil/contracts';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto implements LoginRequest {
  @ApiProperty({ description: 'Correo electrónico del usuario', example: 'juan@barberia.cl' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ description: 'Contraseña del usuario', example: 'MiClaveSegura123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;

  /** Solo necesario si el email existe en más de un negocio. */
  @ApiPropertyOptional({ description: 'Slug del negocio para resolver ambigüedad de email' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  slug?: string;
}
