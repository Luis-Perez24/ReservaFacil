import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Lo que Webpay postea al volver. Los nombres los define Transbank, por eso no
 * siguen el camelCase del resto del proyecto.
 *
 * - `token_ws`: flujo normal, el cliente terminó de pagar (aprobado o rechazado).
 * - `TBK_TOKEN`: el cliente **anuló** el pago en Webpay. No hay nada que
 *   comitear; la reserva sigue `PENDING` y expira sola.
 */
export class WebpayReturnDto {
  @ApiPropertyOptional({ description: 'Token del flujo normal' })
  @IsOptional()
  @IsString()
  token_ws?: string;

  @ApiPropertyOptional({ description: 'Presente solo si el cliente anuló el pago' })
  @IsOptional()
  @IsString()
  TBK_TOKEN?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  TBK_ORDEN_COMPRA?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  TBK_ID_SESION?: string;
}
