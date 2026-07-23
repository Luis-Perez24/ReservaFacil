import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/** Ambiente de Webpay. `integration` usa las credenciales públicas de prueba. */
export enum TransbankEnvironment {
  Integration = 'integration',
  Production = 'production',
}

/**
 * Contrato del entorno. Si algo falta o está mal, el proceso no arranca:
 * es preferible fallar al levantar que descubrir en producción un token
 * firmado con `undefined`.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV!: NodeEnv;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsString()
  @IsNotEmpty()
  POSTGRES_HOST!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  POSTGRES_PORT!: number;

  @IsString()
  @IsNotEmpty()
  POSTGRES_USER!: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_DB!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  REDIS_PORT!: number;

  // 32 caracteres es el piso para que la firma HMAC no sea el eslabón débil.
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_TTL!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_TTL!: string;

  // Webpay Plus. Los valores de integración son públicos (vienen en el propio
  // SDK); en producción se reemplazan por los del convenio con Transbank.
  @IsString()
  @IsNotEmpty()
  TRANSBANK_COMMERCE_CODE!: string;

  @IsString()
  @IsNotEmpty()
  TRANSBANK_API_KEY!: string;

  @IsEnum(TransbankEnvironment)
  TRANSBANK_ENVIRONMENT!: TransbankEnvironment;

  /** A dónde vuelve el navegador del cliente después de pagar. */
  @IsString()
  @IsNotEmpty()
  TRANSBANK_RETURN_URL!: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const detalle = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('\n  - ');
    throw new Error(`Configuración de entorno inválida:\n  - ${detalle}`);
  }

  if (validated.JWT_ACCESS_SECRET === validated.JWT_REFRESH_SECRET) {
    throw new Error(
      'JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser distintos: ' +
        'con el mismo secreto, un refresh token robado puede firmar access tokens.',
    );
  }

  return validated;
}
