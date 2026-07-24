import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  InitPaymentResponse,
  PaymentResultResponse,
  PaymentStatus,
  ReservationStatus,
} from '@reservafacil/contracts';
import { DataSource, Repository } from 'typeorm';

import { ReservationsService } from '../reservations/reservations.service';
import { TenantsService } from '../tenants/tenants.service';
import { buildBuyOrder } from './buy-order';
import { Payment } from './entities/payment.entity';
import { WebpayClient, WebpayCommitResult } from './webpay.client';

/** Webpay aprueba con `response_code = 0` y `status = AUTHORIZED`. */
const APPROVED_RESPONSE_CODE = 0;
const AUTHORIZED_STATUS = 'AUTHORIZED';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly webpay: WebpayClient,
    private readonly tenantsService: TenantsService,
    private readonly reservationsService: ReservationsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Inicia el pago de una reserva: registra el intento y pide a Webpay la URL a
   * la que mandar el navegador. No mueve el estado de la reserva — sigue
   * `PENDING` hasta que vuelva un commit aprobado (regla #3).
   */
  async init(slug: string, reservationId: string): Promise<InitPaymentResponse> {
    const tenant = await this.tenantsService.findBySlug(slug);

    if (!tenant || !tenant.active) {
      throw new NotFoundException('Negocio no encontrado');
    }

    // Valida que la reserva exista, sea de este negocio, siga PENDING y no haya
    // expirado: nunca se manda a pagar un slot que ya se liberó.
    const reservation = await this.reservationsService.findPayable(tenant.id, reservationId);

    const attempt = (await this.payments.countBy({ reservationId: reservation.id })) + 1;
    const buyOrder = buildBuyOrder(reservation.id, attempt);

    const payment = await this.payments.save(
      this.payments.create({
        tenantId: tenant.id,
        reservationId: reservation.id,
        buyOrder,
        amountClp: reservation.priceClp,
        status: PaymentStatus.INITIATED,
        attempt,
        tokenWs: null,
        rawResponse: null,
      }),
    );

    const returnUrl = this.config.getOrThrow<string>('TRANSBANK_RETURN_URL');

    try {
      const created = await this.webpay.create(
        buyOrder,
        reservation.id,
        reservation.priceClp,
        returnUrl,
      );

      // El token es lo que después permite encontrar este intento en el retorno.
      payment.tokenWs = created.token;
      await this.payments.save(payment);

      return {
        url: created.url,
        token: created.token,
        buyOrder,
        amountClp: reservation.priceClp,
      };
    } catch (error) {
      // Transbank no respondió: el intento queda FAILED y la reserva intacta,
      // para que el cliente pueda reintentar con un buy_order nuevo.
      payment.status = PaymentStatus.FAILED;
      payment.rawResponse = { error: error instanceof Error ? error.message : String(error) };
      await this.payments.save(payment);

      this.logger.error(`Webpay falló al crear la transacción ${buyOrder}`, error as Error);
      throw error;
    }
  }

  /**
   * Retorno de Webpay. **Idempotente**: si este intento ya se resolvió, devuelve
   * el resultado guardado sin volver a llamar a Transbank —un segundo commit del
   * mismo token daría error allá— y sin re-confirmar la reserva.
   *
   * Todo corre bajo un lock pesimista sobre la fila del pago. Eso deja la llamada
   * HTTP dentro de la transacción, que no es gratis, pero es el precio de que dos
   * commits simultáneos no puedan cobrar dos veces: acá la corrección manda.
   */
  async commit(token: string): Promise<PaymentResultResponse> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(Payment, {
        where: { tokenWs: token },
        lock: { mode: 'pessimistic_write' },
      });

      if (!payment) {
        throw new NotFoundException('Pago no encontrado');
      }

      const slug = await this.resolveSlug(payment.tenantId);

      // Ya resuelto por un commit anterior: se devuelve tal cual.
      if (payment.status !== PaymentStatus.INITIATED) {
        this.logger.log(`Commit repetido de ${payment.buyOrder}: se devuelve lo guardado`);

        return this.toResult(payment, slug, await this.resolveReservationStatus(payment));
      }

      const result = await this.webpay.commit(token);
      const approved =
        result.responseCode === APPROVED_RESPONSE_CODE && result.status === AUTHORIZED_STATUS;

      // El raw se guarda siempre, aprobado o no: es la fuente de verdad si algo falla.
      payment.rawResponse = result.raw;
      payment.status = approved ? PaymentStatus.APPROVED : PaymentStatus.REJECTED;
      await manager.save(payment);

      if (!approved) {
        // Rechazo: la reserva sigue PENDING y expira sola liberando el slot.
        this.logger.warn(`Pago ${payment.buyOrder} rechazado (code ${result.responseCode})`);

        return this.toResult(payment, slug, ReservationStatus.PENDING, result);
      }

      const reservation = await this.reservationsService.confirmWithinTransaction(
        manager,
        payment.tenantId,
        payment.reservationId,
      );

      return this.toResult(payment, slug, reservation.status, result);
    });
  }

  /** El monto y el estado que ve el cliente, ya sin detalles internos. */
  private toResult(
    payment: Payment,
    slug: string,
    reservationStatus: ReservationStatus,
    result?: WebpayCommitResult,
  ): PaymentResultResponse {
    return {
      reservationId: payment.reservationId,
      slug,
      buyOrder: payment.buyOrder,
      paymentStatus: payment.status,
      reservationStatus,
      amountClp: payment.amountClp,
      authorizationCode:
        result?.authorizationCode ??
        (payment.rawResponse?.authorization_code as string | undefined) ??
        null,
    };
  }

  /** El slug arma la vuelta del cliente a la página de su negocio. */
  private async resolveSlug(tenantId: string): Promise<string> {
    const tenant = await this.tenantsService.findById(tenantId);

    if (!tenant) {
      throw new ConflictException('El pago apunta a un negocio que ya no existe');
    }

    return tenant.slug;
  }

  /** Para el commit repetido: el estado real de la reserva, no uno asumido. */
  private async resolveReservationStatus(payment: Payment): Promise<ReservationStatus> {
    const reservation = await this.reservationsService.findById(
      payment.tenantId,
      payment.reservationId,
    );

    if (!reservation) {
      throw new ConflictException('El pago apunta a una reserva que ya no existe');
    }

    return reservation.status;
  }
}
