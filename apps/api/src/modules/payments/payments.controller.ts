import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { InitPaymentResponse, PaymentResultResponse } from '@reservafacil/contracts';

import { WebpayReturnDto } from './dto/webpay-return.dto';
import { PaymentsService } from './payments.service';

/**
 * Pagar es una acción del cliente en la página pública: sin auth, el negocio
 * sale del slug. El retorno, en cambio, lo invoca el navegador redirigido por
 * Webpay, así que cuelga fuera de `/public/:slug`.
 */
@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('public/:slug/reservations/:reservationId/payments')
  @ApiOperation({ summary: 'Iniciar el pago de una reserva (devuelve URL y token de Webpay)' })
  async init(
    @Param('slug') slug: string,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ): Promise<InitPaymentResponse> {
    return this.paymentsService.init(slug, reservationId);
  }

  /**
   * Webpay redirige el navegador acá con un POST. Devuelve JSON: la página de
   * "pago listo" es del frontend (día 5), el backend solo resuelve el commit.
   */
  @Post('payments/webpay/return')
  @ApiOperation({ summary: 'Retorno de Webpay: confirma el pago (idempotente)' })
  async webpayReturn(@Body() dto: WebpayReturnDto): Promise<PaymentResultResponse> {
    if (!dto.token_ws) {
      // Sin token_ws solo puede ser una anulación del cliente: no hay commit.
      throw new BadRequestException(
        dto.TBK_TOKEN
          ? 'El pago fue anulado en Webpay; la reserva sigue pendiente hasta expirar'
          : 'Falta token_ws',
      );
    }

    return this.paymentsService.commit(dto.token_ws);
  }
}
