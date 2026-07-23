import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebpayPlus } from 'transbank-sdk';

import { TransbankEnvironment } from '../../infra/config/env.validation';

/** Lo que devuelve Webpay al crear la transacción: el navegador postea ahí. */
export interface WebpayCreateResult {
  token: string;
  url: string;
}

/**
 * Resultado del commit, ya normalizado. `raw` guarda la respuesta completa de
 * Transbank tal cual, que es lo que se persiste para auditoría.
 */
export interface WebpayCommitResult {
  buyOrder: string;
  amount: number;
  /** 0 es aprobado; cualquier otro valor es un rechazo del emisor. */
  responseCode: number;
  status: string;
  authorizationCode: string | null;
  raw: Record<string, unknown>;
}

/**
 * Frontera con Transbank. Es una clase abstracta y no una interfaz porque Nest
 * necesita un token de inyección en runtime: así los tests inyectan un doble
 * sin tocar la red, y el resto del módulo no sabe que existe el SDK.
 */
@Injectable()
export abstract class WebpayClient {
  abstract create(
    buyOrder: string,
    sessionId: string,
    amountClp: number,
    returnUrl: string,
  ): Promise<WebpayCreateResult>;

  abstract commit(token: string): Promise<WebpayCommitResult>;
}

/** Implementación real contra el SDK oficial de Transbank. */
@Injectable()
export class TransbankWebpayClient extends WebpayClient {
  private readonly logger = new Logger(TransbankWebpayClient.name);
  // `WebpayPlus.Transaction` es un valor, no un tipo: la instancia se tipa así
  // sin depender de rutas internas del SDK.
  private readonly transaction: InstanceType<typeof WebpayPlus.Transaction>;

  constructor(private readonly config: ConfigService) {
    super();

    const commerceCode = this.config.getOrThrow<string>('TRANSBANK_COMMERCE_CODE');
    const apiKey = this.config.getOrThrow<string>('TRANSBANK_API_KEY');
    const environment = this.config.getOrThrow<TransbankEnvironment>('TRANSBANK_ENVIRONMENT');

    this.transaction =
      environment === TransbankEnvironment.Production
        ? WebpayPlus.Transaction.buildForProduction(commerceCode, apiKey)
        : WebpayPlus.Transaction.buildForIntegration(commerceCode, apiKey);

    this.logger.log(`Webpay Plus en ambiente ${environment}`);
  }

  async create(
    buyOrder: string,
    sessionId: string,
    amountClp: number,
    returnUrl: string,
  ): Promise<WebpayCreateResult> {
    const response = await this.transaction.create(buyOrder, sessionId, amountClp, returnUrl);

    return { token: response.token, url: response.url };
  }

  async commit(token: string): Promise<WebpayCommitResult> {
    const response = await this.transaction.commit(token);

    return {
      buyOrder: response.buy_order,
      amount: response.amount,
      responseCode: response.response_code,
      status: response.status,
      authorizationCode: response.authorization_code ?? null,
      raw: response as Record<string, unknown>,
    };
  }
}
