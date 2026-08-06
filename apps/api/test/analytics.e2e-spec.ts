import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';

/** Mismo lunes de verano chileno que usa `reservations.e2e-spec.ts`. */
const FUTURE_MONDAY = '2027-01-04';
const MONDAY = 1;

describe('Analytics (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

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

  /** Negocio con regla lunes 09:00–11:00 y un servicio; devuelve tenant y servicio. */
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

  /** Reserva CONFIRMED + pago APPROVED con un monto reconocible, sembrada directo en BD. */
  async function seedConfirmedWithPayment(params: {
    tenantId: string;
    serviceId: string;
    startsAt: string;
    endsAt: string;
    amountClp: number;
    attended?: boolean;
  }): Promise<void> {
    const [client]: Array<{ id: string }> = await dataSource.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, 'no-importa', 'Cliente Sembrado', 'CLIENT') RETURNING id`,
      [`seed-${Math.random().toString(36).slice(2)}@test.cl`],
    );

    const [reserva]: Array<{ id: string }> = await dataSource.query(
      `INSERT INTO reservations
         (tenant_id, service_id, client_id, starts_at, ends_at, status, price_clp, attended)
       VALUES ($1, $2, $3, $4, $5, 'CONFIRMED', $6, $7) RETURNING id`,
      [
        params.tenantId,
        params.serviceId,
        client.id,
        params.startsAt,
        params.endsAt,
        params.amountClp,
        params.attended ?? null,
      ],
    );

    await dataSource.query(
      `INSERT INTO payments (tenant_id, reservation_id, buy_order, amount_clp, status, attempt)
       VALUES ($1, $2, $3, $4, 'APPROVED', 1)`,
      [
        params.tenantId,
        reserva.id,
        `seed-${Math.random().toString(36).slice(2)}`,
        params.amountClp,
      ],
    );
  }

  /** El job de BullMQ no corre en tests (`WORKER_MODE` no está activo); se refresca a mano. */
  async function refreshViews(): Promise<void> {
    await dataSource.query('REFRESH MATERIALIZED VIEW mv_tenant_daily_metrics');
    await dataSource.query('REFRESH MATERIALIZED VIEW mv_tenant_service_metrics');
  }

  describe('Aislamiento entre tenants', () => {
    it('cada tenant ve solo sus propios números en /analytics/daily y /analytics/services/top', async () => {
      const negocioA = await setupNegocio('barberia-analytics-a', 'a-analytics@test.cl');
      const negocioB = await setupNegocio('barberia-analytics-b', 'b-analytics@test.cl');

      await seedConfirmedWithPayment({
        tenantId: negocioA.tenantId,
        serviceId: negocioA.serviceId,
        startsAt: `${FUTURE_MONDAY}T12:00:00.000Z`,
        endsAt: `${FUTURE_MONDAY}T12:30:00.000Z`,
        amountClp: 11111,
        attended: true,
      });

      await seedConfirmedWithPayment({
        tenantId: negocioB.tenantId,
        serviceId: negocioB.serviceId,
        startsAt: `${FUTURE_MONDAY}T12:00:00.000Z`,
        endsAt: `${FUTURE_MONDAY}T12:30:00.000Z`,
        amountClp: 22222,
        attended: false,
      });

      await refreshViews();

      const dailyA = await request(app.getHttpServer())
        .get('/analytics/daily')
        .query({ from: FUTURE_MONDAY, to: FUTURE_MONDAY })
        .set('Authorization', `Bearer ${negocioA.token}`)
        .expect(200);

      expect(dailyA.body).toHaveLength(1);
      expect(dailyA.body[0].revenueClp).toBe(11111);
      expect(dailyA.body[0].noShowCount).toBe(0);
      expect(dailyA.body[0].occupancyRate).toBeCloseTo(0.25); // 30 min de 120 disponibles

      const dailyB = await request(app.getHttpServer())
        .get('/analytics/daily')
        .query({ from: FUTURE_MONDAY, to: FUTURE_MONDAY })
        .set('Authorization', `Bearer ${negocioB.token}`)
        .expect(200);

      expect(dailyB.body).toHaveLength(1);
      expect(dailyB.body[0].revenueClp).toBe(22222);
      expect(dailyB.body[0].noShowCount).toBe(1);

      const topA = await request(app.getHttpServer())
        .get('/analytics/services/top')
        .set('Authorization', `Bearer ${negocioA.token}`)
        .expect(200);

      expect(topA.body).toHaveLength(1);
      expect(topA.body[0].revenueClp).toBe(11111);
      expect(topA.body[0].serviceName).toBe('Corte de pelo');

      const topB = await request(app.getHttpServer())
        .get('/analytics/services/top')
        .set('Authorization', `Bearer ${negocioB.token}`)
        .expect(200);

      expect(topB.body).toHaveLength(1);
      expect(topB.body[0].revenueClp).toBe(22222);
    });

    it('rechaza sin token', async () => {
      await request(app.getHttpServer())
        .get('/analytics/daily')
        .query({ from: FUTURE_MONDAY, to: FUTURE_MONDAY })
        .expect(401);

      await request(app.getHttpServer()).get('/analytics/services/top').expect(401);
    });

    it('rechaza "from" posterior a "to" con 400', async () => {
      const negocio = await setupNegocio('barberia-analytics-c', 'c-analytics@test.cl');

      await request(app.getHttpServer())
        .get('/analytics/daily')
        .query({ from: '2027-01-10', to: '2027-01-01' })
        .set('Authorization', `Bearer ${negocio.token}`)
        .expect(400);
    });
  });
});
