import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Redirect } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { InitPaymentResponse } from '@reservafacil/contracts';

import { WebpayReturnDto } from './dto/webpay-return.dto';
import { PaymentsService } from './payments.service';

/** A dónde mandar el navegador según cómo terminó el pago. */
interface RedirectResult {
  url: string;
}

/**
 * Pagar es una acción del cliente en la página pública: sin auth, el negocio
 * sale del slug. El retorno, en cambio, lo invoca el navegador redirigido por
 * Webpay, así que cuelga fuera de `/public/:slug`.
 */
@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Post('public/:slug/reservations/:reservationId/payments')
  @ApiOperation({ summary: 'Iniciar el pago de una reserva (devuelve URL y token de Webpay)' })
  async init(
    @Param('slug') slug: string,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ): Promise<InitPaymentResponse> {
    return this.paymentsService.init(slug, reservationId);
  }

  /**
   * Webpay redirige el navegador acá. La documentación de Transbank describe
   * un POST (form autoenviado), pero el ambiente de integración también
   * redirige por GET con `token_ws` en el query string — confirmado a mano
   * probando el flujo completo. Se aceptan los dos con la misma lógica: no
   * devuelve JSON, quien pagó es una persona mirando la pantalla, así que se
   * hace el commit y se la manda a la página de su reserva.
   *
   * El resultado viaja como estado en la URL, no como dato de confianza: la
   * página igual le pregunta a la API por el estado real de la reserva.
   */
  @Post('payments/webpay/return')
  @Redirect()
  @ApiOperation({ summary: 'Retorno de Webpay por POST: confirma el pago y redirige al frontend' })
  async webpayReturnPost(@Body() dto: WebpayReturnDto): Promise<RedirectResult> {
    return this.resolveWebpayReturn(dto);
  }

  @Get('payments/webpay/return')
  @Redirect()
  @ApiOperation({ summary: 'Retorno de Webpay por GET: mismo caso, algunos ambientes redirigen así' })
  async webpayReturnGet(@Query() dto: WebpayReturnDto): Promise<RedirectResult> {
    return this.resolveWebpayReturn(dto);
  }

  private async resolveWebpayReturn(dto: WebpayReturnDto): Promise<RedirectResult> {
    const webBaseUrl = this.config.getOrThrow<string>('WEB_BASE_URL');

    // Sin token_ws solo puede ser una anulación del cliente: no hay nada que
    // comitear y la reserva sigue PENDING hasta que expire sola.
    if (!dto.token_ws) {
      return { url: `${webBaseUrl}/pago/anulado` };
    }

    const result = await this.paymentsService.commit(dto.token_ws);

    return {
      url: `${webBaseUrl}/${result.slug}/reserva/${result.reservationId}`,
    };
  }
}
