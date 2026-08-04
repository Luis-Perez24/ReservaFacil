import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { EmailChannel } from '../src/modules/notifications/channels/email.channel';
import type { ReminderMessage, ReminderRecipient } from '../src/modules/notifications/channels/notification-channel';
import { REMINDERS_QUEUE } from '../src/modules/notifications/reminders.queue';
import { RemindersService } from '../src/modules/notifications/reminders.service';
import { WebpayClient, WebpayCommitResult, WebpayCreateResult } from '../src/modules/payments/webpay.client';

const MONDAY = 1;
// Muy en el futuro: siempre queda a más de 24h de "ahora", así el scheduler
// no descarta el recordatorio por llegar tarde.
const SLOT = '2028-03-06T12:00:00.000Z';
const PRICE_CLP = 12000;

class FakeWebpayClient extends WebpayClient {
  async create(buyOrder: string): Promise<WebpayCreateResult> {
    return { token: `token-${buyOrder}`, url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' };
  }

  async commit(): Promise<WebpayCommitResult> {
    return {
      buyOrder: 'x',
      amount: PRICE_CLP,
      responseCode: 0,
      status: 'AUTHORIZED',
      authorizationCode: '1213',
      raw: { response_code: 0, status: 'AUTHORIZED' },
    };
  }
}

/** Captura lo que se habría mandado, sin tocar SMTP: hermético para CI. */
class FakeEmailChannel extends EmailChannel {
  sent: Array<{ recipient: ReminderRecipient; message: ReminderMessage }> = [];
  shouldFail = false;

  constructor() {
    super({ get: () => 'test@localhost' } as never);
  }

  override isAvailableFor(recipient: ReminderRecipient): boolean {
    return Boolean(recipient.email);
  }

  override async send(recipient: ReminderRecipient, message: ReminderMessage): Promise<void> {
    if (this.shouldFail) {
      throw new Error('SMTP caído');
    }

    this.sent.push({ recipient, message });
  }
}

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let queue: Queue;
  let email: FakeEmailChannel;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WebpayClient)
      .useValue(new FakeWebpayClient())
      .overrideProvider(EmailChannel)
      .useValue(new FakeEmailChannel())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    queue = app.get<Queue>(getQueueToken(REMINDERS_QUEUE));
    email = app.get(EmailChannel) as unknown as FakeEmailChannel;
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "users", "tenants" RESTART IDENTITY CASCADE');
    await queue.obliterate({ force: true });
    email.sent = [];
    email.shouldFail = false;
  });

  afterAll(async () => {
    await queue.close();
    await app.close();
  });

  /** Negocio + servicio + regla + una reserva pagada y CONFIRMED. */
  async function reservaConfirmada(): Promise<{ reservationId: string; tenantId: string }> {
    const registro = await request(app.getHttpServer())
      .post('/auth/register-business')
      .send({
        businessName: 'Barbería Recordatorios',
        slug: 'barberia-recordatorios',
        ownerFullName: 'Dueño Test',
        email: 'recordatorios@test.cl',
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
      .post('/public/barberia-recordatorios/reservations')
      .send({
        serviceId: servicio.body.id,
        startsAt: SLOT,
        clientName: 'Pedro Cliente',
        clientEmail: 'pedro@cliente.cl',
      })
      .expect(201);

    const reservationId: string = reserva.body.id;

    const pago = await request(app.getHttpServer())
      .post(`/public/barberia-recordatorios/reservations/${reservationId}/payments`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/payments/webpay/return')
      .send({ token_ws: pago.body.token })
      .expect(302);

    return { reservationId, tenantId };
  }

  it('★ al confirmar el pago, encola un job de recordatorio por email con delay', async () => {
    const { reservationId } = await reservaConfirmada();

    const job = await queue.getJob(`${reservationId}-EMAIL`);

    expect(job).toBeDefined();
    expect(job!.data).toMatchObject({ reservationId, channel: 'EMAIL' });
    // starts_at - 24h en 2028 siempre queda muy adelante de "ahora": el delay
    // que BullMQ calculó para este job tiene que ser un número grande, real.
    expect(job!.opts.delay).toBeGreaterThan(1000 * 60 * 60 * 24 * 300);
  });

  it('★ el job queda con backoff exponencial y 5 reintentos (checkpoint día 9)', async () => {
    const { reservationId } = await reservaConfirmada();

    const job = await queue.getJob(`${reservationId}-EMAIL`);

    expect(job!.opts.attempts).toBe(5);
    expect(job!.opts.backoff).toEqual({ type: 'exponential', delay: 60_000 });
  });

  it('no encola nada para WhatsApp: sigue apagado por config (adr/0003)', async () => {
    const { reservationId } = await reservaConfirmada();

    expect(await queue.getJob(`${reservationId}-WHATSAPP`)).toBeUndefined();
  });

  describe('RemindersService.send (lo que corre el processor)', () => {
    it('★ inserta la fila en PENDING antes de mandar, y la deja en SENT', async () => {
      const { reservationId, tenantId } = await reservaConfirmada();
      const service = app.get(RemindersService);

      await service.send(tenantId, reservationId, 'EMAIL');

      expect(email.sent).toHaveLength(1);
      expect(email.sent[0].recipient.email).toBe('pedro@cliente.cl');
      expect(email.sent[0].message.serviceName).toBe('Corte de pelo');

      const [fila]: Array<{ status: string; sent_at: Date | null }> = await dataSource.query(
        'SELECT status, sent_at FROM reminders WHERE reservation_id = $1 AND channel = $2',
        [reservationId, 'EMAIL'],
      );
      expect(fila.status).toBe('SENT');
      expect(fila.sent_at).not.toBeNull();
    });

    it('es idempotente: un segundo envío tras uno ya SENT no manda de nuevo', async () => {
      const { reservationId, tenantId } = await reservaConfirmada();
      const service = app.get(RemindersService);

      await service.send(tenantId, reservationId, 'EMAIL');
      await service.send(tenantId, reservationId, 'EMAIL');

      expect(email.sent).toHaveLength(1);
    });

    it('si el canal falla, deja la fila en FAILED y propaga el error (para el backoff de BullMQ)', async () => {
      const { reservationId, tenantId } = await reservaConfirmada();
      const service = app.get(RemindersService);
      email.shouldFail = true;

      await expect(service.send(tenantId, reservationId, 'EMAIL')).rejects.toThrow('SMTP caído');

      const [fila]: Array<{ status: string; attempts: number; last_error: string }> =
        await dataSource.query(
          'SELECT status, attempts, last_error FROM reminders WHERE reservation_id = $1 AND channel = $2',
          [reservationId, 'EMAIL'],
        );
      expect(fila.status).toBe('FAILED');
      expect(fila.attempts).toBe(1);
      expect(fila.last_error).toContain('SMTP caído');
    });

    it('no manda nada si la reserva ya no existe', async () => {
      const service = app.get(RemindersService);
      const { tenantId } = await reservaConfirmada();

      await service.send(tenantId, '00000000-0000-0000-0000-000000000000', 'EMAIL');

      expect(email.sent).toHaveLength(0);
    });
  });
});
