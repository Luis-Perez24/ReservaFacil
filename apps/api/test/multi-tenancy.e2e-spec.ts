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

const MONDAY = 1;
const SLOT_12 = '2027-01-04T12:00:00.000Z';

/**
 * Aislamiento entre tenants, consolidado en un solo lugar (día 13). Ya se
 * prueba aislamiento repartido en `catalog.e2e-spec.ts` (servicios, reglas),
 * `reservations.e2e-spec.ts` (reservas cross-tenant) y `analytics.e2e-spec.ts`
 * / `ai.e2e-spec.ts` (métricas y chat) — no se duplica acá. Este archivo
 * cubre los dos huecos reales que no tenían cobertura: `payments` y `auth`.
 */
class FakeWebpayClient extends WebpayClient {
  async create(buyOrder: string): Promise<WebpayCreateResult> {
    return { token: `token-${buyOrder}`, url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' };
  }

  async commit(): Promise<WebpayCommitResult> {
    throw new Error('no usado en estos tests');
  }
}

describe('Aislamiento entre tenants (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WebpayClient)
      .useValue(new FakeWebpayClient())
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
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerBusiness(
    slug: string,
    email: string,
  ): Promise<{ token: string; tenantId: string }> {
    const respuesta = await request(app.getHttpServer())
      .post('/auth/register-business')
      .send({
        businessName: `Negocio ${slug}`,
        slug,
        ownerFullName: 'Dueño Test',
        email,
        password: 'clave-segura-123',
      })
      .expect(201);

    return { token: respuesta.body.tokens.accessToken, tenantId: respuesta.body.tenant.id };
  }

  /** Negocio con un servicio y regla lunes 09:00–11:00. */
  async function setupNegocio(
    slug: string,
    email: string,
  ): Promise<{ token: string; tenantId: string; serviceId: string }> {
    const { token, tenantId } = await registerBusiness(slug, email);

    const servicio = await request(app.getHttpServer())
      .post('/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corte de pelo', durationMin: 30, priceClp: 12000 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/availability/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ dayOfWeek: MONDAY, startTime: '09:00', endTime: '11:00', slotIntervalMin: 30 })
      .expect(201);

    return { token, tenantId, serviceId: servicio.body.id };
  }

  async function reservar(slug: string, serviceId: string): Promise<string> {
    const reserva = await request(app.getHttpServer())
      .post(`/public/${slug}/reservations`)
      .send({
        serviceId,
        startsAt: SLOT_12,
        clientName: 'Cliente Test',
        clientEmail: 'cliente@test.cl',
      })
      .expect(201);

    return reserva.body.id;
  }

  describe('payments', () => {
    it('no se puede iniciar el pago de una reserva de otro negocio', async () => {
      const negocioA = await setupNegocio('barberia-a', 'a-pagos@test.cl');
      await setupNegocio('barberia-b', 'b-pagos@test.cl');
      const reservationId = await reservar('barberia-a', negocioA.serviceId);

      // Mismo id de reserva, slug de otro negocio: para B esa reserva no existe.
      await request(app.getHttpServer())
        .post(`/public/barberia-b/reservations/${reservationId}/payments`)
        .expect(404);
    });
  });

  describe('auth', () => {
    it('el mismo email en dos negocios: cada login trae SU tenant, nunca el del otro', async () => {
      const EMAIL_COMPARTIDO = 'dueno-compartido@test.cl';
      const negocioA = await registerBusiness('barberia-auth-a', EMAIL_COMPARTIDO);
      const negocioB = await registerBusiness('barberia-auth-b', EMAIL_COMPARTIDO);

      const loginA = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: EMAIL_COMPARTIDO, password: 'clave-segura-123', slug: 'barberia-auth-a' })
        .expect(200);
      expect(loginA.body.user.tenantId).toBe(negocioA.tenantId);

      const loginB = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: EMAIL_COMPARTIDO, password: 'clave-segura-123', slug: 'barberia-auth-b' })
        .expect(200);
      expect(loginB.body.user.tenantId).toBe(negocioB.tenantId);
      expect(loginB.body.user.tenantId).not.toBe(loginA.body.user.tenantId);
    });

    it('/auth/me nunca devuelve datos de otro tenant', async () => {
      const negocioA = await registerBusiness('barberia-auth-c', 'c-auth@test.cl');
      await registerBusiness('barberia-auth-d', 'd-auth@test.cl');

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${negocioA.token}`)
        .expect(200);

      expect(me.body.tenantId).toBe(negocioA.tenantId);
    });
  });
});
