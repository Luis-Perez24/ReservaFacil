import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import {
  WebpayClient,
  WebpayCommitResult,
  WebpayCreateResult,
} from '../src/modules/payments/webpay.client';

const FUTURE_MONDAY = '2027-01-04';
const MONDAY = 1;
const SLOT_12 = '2027-01-04T12:00:00.000Z';
const PRICE_CLP = 12000;

/** Respuesta de Webpay para un pago aprobado. */
function aprobado(buyOrder: string): WebpayCommitResult {
  return {
    buyOrder,
    amount: PRICE_CLP,
    responseCode: 0,
    status: 'AUTHORIZED',
    authorizationCode: '1213',
    raw: {
      buy_order: buyOrder,
      amount: PRICE_CLP,
      response_code: 0,
      status: 'AUTHORIZED',
      authorization_code: '1213',
      card_detail: { card_number: '6623' },
    },
  };
}

/** Rechazo del emisor: response_code distinto de 0. */
function rechazado(buyOrder: string): WebpayCommitResult {
  return {
    buyOrder,
    amount: PRICE_CLP,
    responseCode: -1,
    status: 'FAILED',
    authorizationCode: null,
    raw: { buy_order: buyOrder, response_code: -1, status: 'FAILED' },
  };
}

/**
 * Doble de Webpay: cuenta las llamadas para poder afirmar que un commit
 * repetido NO vuelve a pegarle a Transbank.
 */
class FakeWebpayClient extends WebpayClient {
  createCalls = 0;
  commitCalls = 0;
  lastBuyOrder = '';
  commitResponse: (buyOrder: string) => WebpayCommitResult = aprobado;
  failOnCreate = false;

  async create(buyOrder: string): Promise<WebpayCreateResult> {
    this.createCalls += 1;
    this.lastBuyOrder = buyOrder;

    if (this.failOnCreate) {
      throw new Error('Transbank no responde');
    }

    return { token: `token-${buyOrder}`, url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' };
  }

  async commit(): Promise<WebpayCommitResult> {
    this.commitCalls += 1;

    return this.commitResponse(this.lastBuyOrder);
  }
}

describe('Payments (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const webpay = new FakeWebpayClient();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WebpayClient)
      .useValue(webpay)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "users", "tenants" RESTART IDENTITY CASCADE');
    webpay.createCalls = 0;
    webpay.commitCalls = 0;
    webpay.commitResponse = aprobado;
    webpay.failOnCreate = false;
  });

  afterAll(async () => {
    await app.close();
  });

  /** Negocio + servicio + regla + una reserva PENDING lista para pagar. */
  async function setupReserva(): Promise<{ reservationId: string; tenantId: string }> {
    const registro = await request(app.getHttpServer())
      .post('/auth/register-business')
      .send({
        businessName: 'Barbería Pagos',
        slug: 'barberia-pagos',
        ownerFullName: 'Dueño Test',
        email: 'pagos@test.cl',
        password: 'clave-segura-123',
      })
      .expect(201);

    const token = registro.body.tokens.accessToken;
    const tenantId = registro.body.tenant.id;

    const servicio = await request(app.getHttpServer())
      .post('/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corte de pelo', durationMin: 30, priceClp: PRICE_CLP })
      .expect(201);

    await request(app.getHttpServer())
      .post('/availability/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ dayOfWeek: MONDAY, startTime: '09:00', endTime: '11:00', slotIntervalMin: 30 })
      .expect(201);

    const reserva = await request(app.getHttpServer())
      .post('/public/barberia-pagos/reservations')
      .send({
        serviceId: servicio.body.id,
        startsAt: SLOT_12,
        clientName: 'Pedro Cliente',
        clientEmail: 'pedro@cliente.cl',
      })
      .expect(201);

    return { reservationId: reserva.body.id, tenantId };
  }

  function iniciarPago(reservationId: string): request.Test {
    return request(app.getHttpServer()).post(
      `/public/barberia-pagos/reservations/${reservationId}/payments`,
    );
  }

  function retornoWebpay(token: string): request.Test {
    return request(app.getHttpServer()).post('/payments/webpay/return').send({ token_ws: token });
  }

  async function estadoReserva(reservationId: string): Promise<string> {
    const [row]: Array<{ status: string }> = await dataSource.query(
      'SELECT status FROM reservations WHERE id = $1',
      [reservationId],
    );
    return row.status;
  }

  describe('POST .../reservations/:id/payments', () => {
    it('inicia el pago y devuelve la URL y el token de Webpay', async () => {
      const { reservationId } = await setupReserva();

      const respuesta = await iniciarPago(reservationId).expect(201);

      expect(respuesta.body).toMatchObject({ amountClp: PRICE_CLP });
      expect(respuesta.body.url).toContain('transbank');
      expect(respuesta.body.token).toBeTruthy();
      // buy_order = prefijo del uuid + intento, dentro del tope de Webpay.
      expect(respuesta.body.buyOrder).toMatch(/^[0-9a-f]{20}-1$/);
      expect(respuesta.body.buyOrder.length).toBeLessThanOrEqual(26);

      // Iniciar el pago NO confirma nada: la reserva sigue pendiente (regla #3).
      expect(await estadoReserva(reservationId)).toBe('PENDING');
    });

    it('registra el intento como INITIATED antes de que el cliente pague', async () => {
      const { reservationId } = await setupReserva();
      await iniciarPago(reservationId).expect(201);

      const [pago]: Array<{ status: string; attempt: number; amount_clp: number }> =
        await dataSource.query('SELECT status, attempt, amount_clp FROM payments WHERE reservation_id = $1', [
          reservationId,
        ]);

      expect(pago).toMatchObject({ status: 'INITIATED', attempt: 1, amount_clp: PRICE_CLP });
    });

    it('numera los intentos: el segundo pago de la misma reserva es el intento 2', async () => {
      const { reservationId } = await setupReserva();

      const primero = await iniciarPago(reservationId).expect(201);
      const segundo = await iniciarPago(reservationId).expect(201);

      expect(primero.body.buyOrder).toMatch(/-1$/);
      expect(segundo.body.buyOrder).toMatch(/-2$/);
      expect(primero.body.buyOrder).not.toBe(segundo.body.buyOrder);
    });

    it('responde 404 si la reserva no existe', async () => {
      await setupReserva();

      await iniciarPago('00000000-0000-0000-0000-000000000000').expect(404);
    });

    it('marca el intento FAILED si Transbank no responde', async () => {
      const { reservationId } = await setupReserva();
      webpay.failOnCreate = true;

      await iniciarPago(reservationId).expect(500);

      const [pago]: Array<{ status: string }> = await dataSource.query(
        'SELECT status FROM payments WHERE reservation_id = $1',
        [reservationId],
      );
      expect(pago.status).toBe('FAILED');
      // La reserva queda intacta para poder reintentar.
      expect(await estadoReserva(reservationId)).toBe('PENDING');
    });
  });

  describe('POST /payments/webpay/return', () => {
    /**
     * Este endpoint lo invoca el navegador, no un cliente de API: responde 302
     * hacia el frontend. Lo que importa es a dónde manda a la persona y en qué
     * quedó la base, no un cuerpo JSON.
     */
    it('★ pago aprobado: PENDING → CONFIRMED y se guarda el raw_response', async () => {
      const { reservationId } = await setupReserva();
      const inicio = await iniciarPago(reservationId).expect(201);

      const respuesta = await retornoWebpay(inicio.body.token).expect(302);

      // Vuelve a la página de su reserva, en el negocio correcto.
      expect(respuesta.headers.location).toBe(
        `http://localhost:4200/barberia-pagos/reserva/${reservationId}`,
      );
      expect(await estadoReserva(reservationId)).toBe('CONFIRMED');

      const [pago]: Array<{ status: string; raw_response: Record<string, unknown> }> =
        await dataSource.query(
          'SELECT status, raw_response FROM payments WHERE reservation_id = $1',
          [reservationId],
        );
      expect(pago.status).toBe('APPROVED');
      expect(pago.raw_response).toMatchObject({ authorization_code: '1213' });
    });

    it('al confirmar se limpia expires_at: el slot ya es del cliente', async () => {
      const { reservationId } = await setupReserva();
      const inicio = await iniciarPago(reservationId).expect(201);

      await retornoWebpay(inicio.body.token).expect(302);

      const [reserva]: Array<{ expires_at: Date | null }> = await dataSource.query(
        'SELECT expires_at FROM reservations WHERE id = $1',
        [reservationId],
      );
      expect(reserva.expires_at).toBeNull();
    });

    it('★ commit repetido del mismo token: idempotente, no re-cobra', async () => {
      const { reservationId } = await setupReserva();
      const inicio = await iniciarPago(reservationId).expect(201);

      const primero = await retornoWebpay(inicio.body.token).expect(302);
      expect(webpay.commitCalls).toBe(1);

      const segundo = await retornoWebpay(inicio.body.token).expect(302);

      // No se volvió a llamar a Transbank y termina en el mismo lugar.
      expect(webpay.commitCalls).toBe(1);
      expect(segundo.headers.location).toBe(primero.headers.location);
      expect(await estadoReserva(reservationId)).toBe('CONFIRMED');

      // Y sigue habiendo un solo pago aprobado.
      const [{ count }]: Array<{ count: number }> = await dataSource.query(
        "SELECT count(*)::int AS count FROM payments WHERE reservation_id = $1 AND status = 'APPROVED'",
        [reservationId],
      );
      expect(Number(count)).toBe(1);
    });

    /**
     * La carrera que introduce el job de expiración (día 9): el cliente inicia
     * el pago con el hold vigente, pero para cuando Webpay responde el job ya
     * lo pasó a `EXPIRED` —diez minutos son una eternidad si el navegador se
     * demora en volver—. El dinero de todas formas se cobró: `commit()` no
     * puede perder ese hecho solo porque la reserva ya no es confirmable
     * (`ReservationSlotLostError`, `adr/0006`). Se fuerza el `EXPIRED` por SQL
     * directo en vez de esperar el minuto real: es la forma determinista de
     * plantar la misma ventana de tiempo sin un test lento o intermitente.
     */
    it('★ pago aprobado tras expirar el hold: se guarda el cobro, la reserva no se confirma', async () => {
      const { reservationId } = await setupReserva();
      const inicio = await iniciarPago(reservationId).expect(201);

      await dataSource.query("UPDATE reservations SET status = 'EXPIRED' WHERE id = $1", [
        reservationId,
      ]);

      await retornoWebpay(inicio.body.token).expect(302);

      expect(await estadoReserva(reservationId)).toBe('EXPIRED');

      const [pago]: Array<{ status: string }> = await dataSource.query(
        'SELECT status FROM payments WHERE reservation_id = $1',
        [reservationId],
      );
      // El punto central: el pago queda APPROVED, no se pierde ni se atasca en
      // INITIATED por el rollback que un throw sin capturar habría causado.
      expect(pago.status).toBe('APPROVED');
    });

    it('pago rechazado: la reserva sigue PENDING y expira sola', async () => {
      const { reservationId } = await setupReserva();
      webpay.commitResponse = rechazado;
      const inicio = await iniciarPago(reservationId).expect(201);

      // También vuelve a su reserva: la página le dirá que sigue sin pagar.
      await retornoWebpay(inicio.body.token).expect(302);

      expect(await estadoReserva(reservationId)).toBe('PENDING');

      const [pago]: Array<{ status: string }> = await dataSource.query(
        'SELECT status FROM payments WHERE reservation_id = $1',
        [reservationId],
      );
      expect(pago.status).toBe('REJECTED');
    });

    it('tras un rechazo se puede reintentar y confirmar con el intento 2', async () => {
      const { reservationId } = await setupReserva();

      webpay.commitResponse = rechazado;
      const primerIntento = await iniciarPago(reservationId).expect(201);
      await retornoWebpay(primerIntento.body.token).expect(302);
      expect(await estadoReserva(reservationId)).toBe('PENDING');

      webpay.commitResponse = aprobado;
      const segundoIntento = await iniciarPago(reservationId).expect(201);
      await retornoWebpay(segundoIntento.body.token).expect(302);

      expect(await estadoReserva(reservationId)).toBe('CONFIRMED');
    });

    it('no se puede volver a pagar una reserva ya confirmada', async () => {
      const { reservationId } = await setupReserva();
      const inicio = await iniciarPago(reservationId).expect(201);
      await retornoWebpay(inicio.body.token).expect(302);

      await iniciarPago(reservationId).expect(409);
    });

    it('token desconocido responde 404', async () => {
      await setupReserva();

      await retornoWebpay('token-que-no-existe').expect(404);
    });

    it('si el cliente anula en Webpay vuelve a una página, sin tocar la reserva', async () => {
      const { reservationId } = await setupReserva();
      await iniciarPago(reservationId).expect(201);

      // Webpay manda TBK_TOKEN y ningún token_ws cuando la persona se arrepiente.
      const respuesta = await request(app.getHttpServer())
        .post('/payments/webpay/return')
        .send({ TBK_TOKEN: 'abc', TBK_ORDEN_COMPRA: 'x', TBK_ID_SESION: 'y' })
        .expect(302);

      expect(respuesta.headers.location).toBe('http://localhost:4200/pago/anulado');
      expect(await estadoReserva(reservationId)).toBe('PENDING');
      expect(webpay.commitCalls).toBe(0);
    });
  });
});
