import type { LoginRequest } from '@reservafacil/contracts';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto implements LoginRequest {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;

  /** Solo necesario si el email existe en más de un negocio. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  slug?: string;
}
