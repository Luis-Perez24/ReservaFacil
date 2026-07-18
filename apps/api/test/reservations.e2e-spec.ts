import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';

/** Lunes de verano chileno (UTC-3), lejano para que el filtro de "solo futuros" no lo toque. */
const FUTURE_MONDAY = '2027-01-04';
const MONDAY = 1;

/** Slots conocidos de un servicio de 30 min con regla 09:00–11:00 local. */
const SLOT_12 = '2027-01-04T12:00:00.000Z';
const SLOT_1230 = '2027-01-04T12:30:00.000Z';

describe('Reservations (e2e)', () => {
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
    durationMin = 30,
  ): Promise<{ token: string; tenantId: string; serviceId: string }> {
    const { token, tenantId } = await registerBusiness('barberia-a', 'a@test.cl');

    const servicio = await request(app.getHttpServer())
      .post('/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corte de pelo', durationMin, priceClp: 12000 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/availability/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ dayOfWeek: MONDAY, startTime: '09:00', endTime: '11:00', slotIntervalMin: 30 })
      .expect(201);

    return { token, tenantId, serviceId: servicio.body.id };
  }

  function reservar(serviceId: string, startsAt: string): request.Test {
    return request(app.getHttpServer())
      .post('/public/barberia-a/reservations')
      .send({
        serviceId,
        startsAt,
        clientName: 'Cliente Test',
        clientEmail: 'cliente@test.cl',
        clientPhone: '+56911111111',
      });
  }

  /** Reserva sembrada directo en BD (por ejemplo un PENDING ya vencido). */
  async function seedReservation(params: {
    tenantId: string;
    serviceId: string;
    startsAt: string;
    endsAt: string;
    status: 'PENDING' | 'PAID' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
    expiresAt?: string;
  }): Promise<void> {
    const [client]: Array<{ id: string }> = await dataSource.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, 'no-importa', 'Cliente Sembrado', 'CLIENT') RETURNING id`,
      [`seed-${Math.random().toString(36).slice(2)}@test.cl`],
    );

    await dataSource.query(
      `INSERT INTO reservations
         (tenant_id, service_id, client_id, starts_at, ends_at, status, expires_at, price_clp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 12000)`,
      [
        params.tenantId,
        params.serviceId,
        client.id,
        params.startsAt,
        params.endsAt,
        params.status,
        params.expiresAt ?? null,
      ],
    );
  }

  async function contarActivas(serviceId: string, startsAt: string): Promise<number> {
    const [{ count }]: Array<{ count: string }> = await dataSource.query(
      `SELECT count(*)::int AS count FROM reservations
        WHERE service_id = $1 AND starts_at = $2
          AND status IN ('PENDING', 'PAID', 'CONFIRMED')`,
      [serviceId, startsAt],
    );
    return Number(count);
  }

  describe('POST /public/:slug/reservations', () => {
    it('crea un PENDING con retención de 10 min y copia el precio', async () => {
      const { serviceId } = await setupNegocio();

      const respuesta = await reservar(serviceId, SLOT_12).expect(201);

      expect(respuesta.body).toMatchObject({
        serviceId,
        status: 'PENDING',
        startsAt: SLOT_12,
        endsAt: '2027-01-04T12:30:00.000Z',
        priceClp: 12000,
      });
      expect(respuesta.body.expiresAt).not.toBeNull();

      const minutosDeRetencion =
        (new Date(respuesta.body.expiresAt).getTime() - Date.now()) / 60000;
      expect(minutosDeRetencion).toBeGreaterThan(9);
      expect(minutosDeRetencion).toBeLessThanOrEqual(10);
    });

    it('rechaza un horario fuera de la agenda con 409', async () => {
      const { serviceId } = await setupNegocio();

      // 20:00Z cae fuera de la ventana 09:00–11:00 local.
      await reservar(serviceId, '2027-01-04T20:00:00.000Z').expect(409);
    });

    it('responde 404 con un slug inexistente', async () => {
      const { serviceId } = await setupNegocio();

      await request(app.getHttpServer())
        .post('/public/no-existe/reservations')
        .send({
          serviceId,
          startsAt: SLOT_12,
          clientName: 'Cliente Test',
          clientEmail: 'cliente@test.cl',
        })
        .expect(404);
    });

    it('responde 404 con un servicio inexistente', async () => {
      await setupNegocio();

      await reservar('00000000-0000-0000-0000-000000000000', SLOT_12).expect(404);
    });

    it('un PENDING vigente ocupa el slot: la segunda reserva recibe 409', async () => {
      const { serviceId } = await setupNegocio();

      await reservar(serviceId, SLOT_12).expect(201);
      await reservar(serviceId, SLOT_12).expect(409);

      expect(await contarActivas(serviceId, SLOT_12)).toBe(1);
    });

    it('un PENDING expirado libera el slot: la nueva reserva pasa (regla #2)', async () => {
      const { tenantId, serviceId } = await setupNegocio();

      await seedReservation({
        tenantId,
        serviceId,
        startsAt: SLOT_12,
        endsAt: '2027-01-04T12:30:00Z',
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      });

      await reservar(serviceId, SLOT_12).expect(201);

      // El hold muerto quedó EXPIRED y solo hay una reserva activa en el slot.
      expect(await contarActivas(serviceId, SLOT_12)).toBe(1);
    });

    it('★ dos reservas simultáneas al MISMO slot → una 201, una 409, cero dobles', async () => {
      const { serviceId } = await setupNegocio();

      const resultados = await Promise.all([
        reservar(serviceId, SLOT_12),
        reservar(serviceId, SLOT_12),
      ]);

      const status = resultados.map((r) => r.status).sort();
      expect(status).toEqual([201, 409]);
      expect(await contarActivas(serviceId, SLOT_12)).toBe(1);
    });

    it('★ dos reservas simultáneas con solape PARCIAL → una 201, una 409', async () => {
      // Servicio de 60 min: 12:00–13:00 y 12:30–13:30 se pisan pese a distinto
      // starts_at. El índice único (sobre starts_at exacto) no los atrapa: solo
      // el lock sobre la fila del servicio evita la doble reserva.
      const { serviceId } = await setupNegocio(60);

      const resultados = await Promise.all([
        reservar(serviceId, SLOT_12),
        reservar(serviceId, SLOT_1230),
      ]);

      const status = resultados.map((r) => r.status).sort();
      expect(status).toEqual([201, 409]);

      const [{ count }]: Array<{ count: string }> = await dataSource.query(
        `SELECT count(*)::int AS count FROM reservations
          WHERE service_id = $1 AND status IN ('PENDING', 'PAID', 'CONFIRMED')`,
        [serviceId],
      );
      expect(Number(count)).toBe(1);
    });
  });
});
