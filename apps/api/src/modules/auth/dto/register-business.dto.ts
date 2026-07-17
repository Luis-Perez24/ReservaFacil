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
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  businessName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(SLUG_PATTERN, {
    message: 'slug solo admite minúsculas, números y guiones (ej: barberia-don-lucho)',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  timezone?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  ownerFullName!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
