import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';

/**
 * Lunes de verano chileno (UTC-3), lo bastante lejano para que el filtro de
 * "solo slots futuros" no toque estos tests en años.
 */
const FUTURE_MONDAY = '2027-01-04';
const MONDAY = 1;

describe('Catalog (e2e)', () => {
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
    // El CASCADE arrastra services, reglas, excepciones y reservations vía FK.
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

  async function createService(
    token: string,
    overrides: Partial<{ name: string; durationMin: number; priceClp: number }> = {},
  ): Promise<{ id: string }> {
    const respuesta = await request(app.getHttpServer())
      .post('/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corte de pelo', durationMin: 30, priceClp: 12000, ...overrides })
      .expect(201);

    return respuesta.body;
  }

  /** Siembra una reserva directo en BD: POST /reservations recién existe el día 3. */
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
       VALUES ($1, 'no-importa', 'Cliente Test', 'CLIENT') RETURNING id`,
      [`cliente-${Math.random().toString(36).slice(2)}@test.cl`],
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

  describe('/services (dashboard)', () => {
    it('crea y lista servicios del negocio', async () => {
      const { token } = await registerBusiness('barberia-a', 'a@test.cl');

      await createService(token, { name: 'Corte + barba', durationMin: 45, priceClp: 18000 });

      const lista = await request(app.getHttpServer())
        .get('/services')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(lista.body).toHaveLength(1);
      expect(lista.body[0]).toMatchObject({
        name: 'Corte + barba',
        durationMin: 45,
        priceClp: 18000,
        active: true,
      });
    });

    it('rechaza sin token con 401', async () => {
      await request(app.getHttpServer()).get('/services').expect(401);
    });

    it('edita un servicio con PATCH', async () => {
      const { token } = await registerBusiness('barberia-a', 'a@test.cl');
      const servicio = await createService(token);

      const editado = await request(app.getHttpServer())
        .patch(`/services/${servicio.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ priceClp: 15000 })
        .expect(200);

      expect(editado.body.priceClp).toBe(15000);
    });

    it('DELETE desactiva en vez de borrar', async () => {
      const { token } = await registerBusiness('barberia-a', 'a@test.cl');
      const servicio = await createService(token);

      await request(app.getHttpServer())
        .delete(`/services/${servicio.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const lista = await request(app.getHttpServer())
        .get('/services')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(lista.body[0].active).toBe(false);
    });

    it('un negocio no ve ni edita los servicios de otro', async () => {
      const negocioA = await registerBusiness('barberia-a', 'a@test.cl');
      const negocioB = await registerBusiness('barberia-b', 'b@test.cl');
      const servicioDeA = await createService(negocioA.token);

      const listaDeB = await request(app.getHttpServer())
        .get('/services')
        .set('Authorization', `Bearer ${negocioB.token}`)
        .expect(200);
      expect(listaDeB.body).toHaveLength(0);

      // Mismo id, otro tenant: para B ese servicio no existe.
      await request(app.getHttpServer())
        .patch(`/services/${servicioDeA.id}`)
        .set('Authorization', `Bearer ${negocioB.token}`)
        .send({ priceClp: 1 })
        .expect(404);
    });
  });

  describe('/availability/rules (dashboard)', () => {
    it('crea una regla y la devuelve con horas HH:mm', async () => {
      const { token } = await registerBusiness('barberia-a', 'a@test.cl');

      const regla = await request(app.getHttpServer())
        .post('/availability/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ dayOfWeek: MONDAY, startTime: '09:00', endTime: '18:00', slotIntervalMin: 30 })
        .expect(201);

      expect(regla.body).toMatchObject({
        dayOfWeek: MONDAY,
        startTime: '09:00',
        endTime: '18:00',
        slotIntervalMin: 30,
      });
    });

    it('rechaza endTime menor o igual que startTime con 400', async () => {
      const { token } = await registerBusiness('barberia-a', 'a@test.cl');

      await request(app.getHttpServer())
        .post('/availability/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ dayOfWeek: MONDAY, startTime: '18:00', endTime: '09:00', slotIntervalMin: 30 })
        .expect(400);
    });

    it('rechaza una regla que se solapa el mismo día con 409', async () => {
      const { token } = await registerBusiness('barberia-a', 'a@test.cl');

      await request(app.getHttpServer())
        .post('/availability/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ dayOfWeek: MONDAY, startTime: '09:00', endTime: '13:00', slotIntervalMin: 30 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/availability/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ dayOfWeek: MONDAY, startTime: '12:00', endTime: '16:00', slotIntervalMin: 30 })
        .expect(409);

      // La misma franja en otro día no choca.
      await request(app.getHttpServer())
        .post('/availability/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ dayOfWeek: 2, startTime: '12:00', endTime: '16:00', slotIntervalMin: 30 })
        .expect(201);
    });

    it('elimina una regla', async () => {
      const { token } = await registerBusiness('barberia-a', 'a@test.cl');

      const regla = await request(app.getHttpServer())
        .post('/availability/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ dayOfWeek: MONDAY, startTime: '09:00', endTime: '13:00', slotIntervalMin: 30 })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/availability/rules/${regla.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const lista = await request(app.getHttpServer())
        .get('/availability/rules')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(lista.body).toHaveLength(0);
    });
  });

  describe('/availability/exceptions (dashboard)', () => {
    it('crea un feriado', async () => {
      const { token } = await registerBusiness('barberia-a', 'a@test.cl');

      const feriado = await request(app.getHttpServer())
        .post('/availability/exceptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: FUTURE_MONDAY, closed: true })
        .expect(201);

      expect(feriado.body).toMatchObject({ date: FUTURE_MONDAY, closed: true, startTime: null });
    });

    it('rechaza un día cerrado con horario con 400', async () => {
      const { token } = await registerBusiness('barberia-a', 'a@test.cl');

      await request(app.getHttpServer())
        .post('/availability/exceptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: FUTURE_MONDAY, closed: true, startTime: '10:00', endTime: '14:00' })
        .expect(400);
    });

    it('rechaza un horario especial sin horas con 400', async () => {
      const { token } = await registerBusiness('barberia-a', 'a@test.cl');

      await request(app.getHttpServer())
        .post('/availability/exceptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: FUTURE_MONDAY, closed: false })
        .expect(400);
    });

    it('rechaza una fecha que no existe con 400', async () => {
      const { token } = await registerBusiness('barberia-a', 'a@test.cl');

      await request(app.getHttpServer())
        .post('/availability/exceptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2027-02-30', closed: true })
        .expect(400);
    });

    it('rechaza dos excepciones para la misma fecha con 409', async () => {
      const { token } = await registerBusiness('barberia-a', 'a@test.cl');

      await request(app.getHttpServer())
        .post('/availability/exceptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: FUTURE_MONDAY, closed: true })
        .expect(201);

      await request(app.getHttpServer())
        .post('/availability/exceptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: FUTURE_MONDAY, closed: false, startTime: '10:00', endTime: '14:00' })
        .expect(409);
    });
  });

  describe('GET /public/:slug', () => {
    it('devuelve los datos públicos del negocio, sin auth', async () => {
      await registerBusiness('barberia-a', 'a@test.cl');

      const negocio = await request(app.getHttpServer()).get('/public/barberia-a').expect(200);

      expect(negocio.body).toMatchObject({
        name: 'Negocio barberia-a',
        slug: 'barberia-a',
        timezone: 'America/Santiago',
      });
      // Sin uuid ni flags internos: quien entra por el slug no los necesita.
      expect(negocio.body.id).toBeUndefined();
      expect(negocio.body.active).toBeUndefined();
    });

    it('un slug inexistente responde 404', async () => {
      await request(app.getHttpServer()).get('/public/no-existe').expect(404);
    });
  });

  describe('GET /public/:slug/services', () => {
    it('lista solo servicios activos, sin auth', async () => {
      const { token } = await registerBusiness('barberia-a', 'a@test.cl');
      await createService(token, { name: 'Visible' });
      const inactivo = await createService(token, { name: 'Oculto' });

      await request(app.getHttpServer())
        .delete(`/services/${inactivo.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const lista = await request(app.getHttpServer())
        .get('/public/barberia-a/services')
        .expect(200);

      expect(lista.body).toHaveLength(1);
      expect(lista.body[0].name).toBe('Visible');
      // Lo público no expone flags internos.
      expect(lista.body[0].active).toBeUndefined();
    });

    it('un slug inexistente responde 404', async () => {
      await request(app.getHttpServer()).get('/public/no-existe/services').expect(404);
    });
  });

  describe('GET /public/:slug/availability', () => {
    async function setupNegocioConHorario(): Promise<{
      token: string;
      tenantId: string;
      serviceId: string;
    }> {
      const { token, tenantId } = await registerBusiness('barberia-a', 'a@test.cl');
      const servicio = await createService(token, { durationMin: 30 });

      await request(app.getHttpServer())
        .post('/availability/rules')
        .set('Authorization', `Bearer ${token}`)
        .send({ dayOfWeek: MONDAY, startTime: '09:00', endTime: '11:00', slotIntervalMin: 30 })
        .expect(201);

      return { token, tenantId, serviceId: servicio.id };
    }

    it('devuelve la grilla completa en UTC (verano chileno, UTC-3)', async () => {
      const { serviceId } = await setupNegocioConHorario();

      const respuesta = await request(app.getHttpServer())
        .get(`/public/barberia-a/availability?serviceId=${serviceId}&date=${FUTURE_MONDAY}`)
        .expect(200);

      expect(respuesta.body.timezone).toBe('America/Santiago');
      expect(respuesta.body.slots.map((s: { startsAt: string }) => s.startsAt)).toEqual([
        '2027-01-04T12:00:00.000Z',
        '2027-01-04T12:30:00.000Z',
        '2027-01-04T13:00:00.000Z',
        '2027-01-04T13:30:00.000Z',
      ]);
    });

    it('descuenta una reserva CONFIRMED', async () => {
      const { tenantId, serviceId } = await setupNegocioConHorario();

      await seedReservation({
        tenantId,
        serviceId,
        startsAt: '2027-01-04T12:30:00Z',
        endsAt: '2027-01-04T13:00:00Z',
        status: 'CONFIRMED',
      });

      const respuesta = await request(app.getHttpServer())
        .get(`/public/barberia-a/availability?serviceId=${serviceId}&date=${FUTURE_MONDAY}`)
        .expect(200);

      expect(respuesta.body.slots.map((s: { startsAt: string }) => s.startsAt)).toEqual([
        '2027-01-04T12:00:00.000Z',
        '2027-01-04T13:00:00.000Z',
        '2027-01-04T13:30:00.000Z',
      ]);
    });

    it('una PENDING vigente ocupa; una PENDING expirada libera (regla #2)', async () => {
      const { tenantId, serviceId } = await setupNegocioConHorario();
      const enUnaHora = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      await seedReservation({
        tenantId,
        serviceId,
        startsAt: '2027-01-04T12:00:00Z',
        endsAt: '2027-01-04T12:30:00Z',
        status: 'PENDING',
        expiresAt: enUnaHora,
      });
      await seedReservation({
        tenantId,
        serviceId,
        startsAt: '2027-01-04T13:00:00Z',
        endsAt: '2027-01-04T13:30:00Z',
        status: 'PENDING',
        expiresAt: haceUnaHora,
      });

      const respuesta = await request(app.getHttpServer())
        .get(`/public/barberia-a/availability?serviceId=${serviceId}&date=${FUTURE_MONDAY}`)
        .expect(200);

      // La vigente (12:00Z) desapareció; la expirada (13:00Z) sigue libre.
      expect(respuesta.body.slots.map((s: { startsAt: string }) => s.startsAt)).toEqual([
        '2027-01-04T12:30:00.000Z',
        '2027-01-04T13:00:00.000Z',
        '2027-01-04T13:30:00.000Z',
      ]);
    });

    it('una excepción de día cerrado deja el día sin slots', async () => {
      const { token, serviceId } = await setupNegocioConHorario();

      await request(app.getHttpServer())
        .post('/availability/exceptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: FUTURE_MONDAY, closed: true })
        .expect(201);

      const respuesta = await request(app.getHttpServer())
        .get(`/public/barberia-a/availability?serviceId=${serviceId}&date=${FUTURE_MONDAY}`)
        .expect(200);

      expect(respuesta.body.slots).toEqual([]);
    });

    it('un horario especial reemplaza la regla del día', async () => {
      const { token, serviceId } = await setupNegocioConHorario();

      await request(app.getHttpServer())
        .post('/availability/exceptions')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: FUTURE_MONDAY, closed: false, startTime: '10:00', endTime: '11:00' })
        .expect(201);

      const respuesta = await request(app.getHttpServer())
        .get(`/public/barberia-a/availability?serviceId=${serviceId}&date=${FUTURE_MONDAY}`)
        .expect(200);

      expect(respuesta.body.slots.map((s: { startsAt: string }) => s.startsAt)).toEqual([
        '2027-01-04T13:00:00.000Z',
        '2027-01-04T13:30:00.000Z',
      ]);
    });

    it('un día sin reglas responde vacío, no error', async () => {
      const { serviceId } = await setupNegocioConHorario();

      // 2027-01-05 es martes y solo hay regla de lunes.
      const respuesta = await request(app.getHttpServer())
        .get(`/public/barberia-a/availability?serviceId=${serviceId}&date=2027-01-05`)
        .expect(200);

      expect(respuesta.body.slots).toEqual([]);
    });

    it('el servicio de otro negocio responde 404', async () => {
      const { serviceId } = await setupNegocioConHorario();
      await registerBusiness('barberia-b', 'b@test.cl');

      await request(app.getHttpServer())
        .get(`/public/barberia-b/availability?serviceId=${serviceId}&date=${FUTURE_MONDAY}`)
        .expect(404);
    });

    it('una fecha con formato inválido responde 400', async () => {
      const { serviceId } = await setupNegocioConHorario();

      await request(app.getHttpServer())
        .get(`/public/barberia-a/availability?serviceId=${serviceId}&date=04-01-2027`)
        .expect(400);
    });
  });
});
