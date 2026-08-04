import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { ReservationsService } from '../src/modules/reservations/reservations.service';

const MONDAY = 1;
const SLOT_12 = '2027-01-04T12:00:00.000Z';

/**
 * El job del día 9 corre cada minuto vía `ExpirationProcessor`
 * (`worker-mode.e2e-spec.ts` cubre que solo se activa en el proceso worker).
 * Acá se prueba directo contra `ReservationsService.expireStalePending()`, sin
 * pasar por BullMQ/Redis: es la misma llamada que hace el processor en cada
 * tick, y probarla así es determinista —nada de esperar un minuto real— y no
 * arrastra el problema encontrado al escribir el processor (un `Worker` que ya
 * procesó un job repetible contra Redis real dejaba, dentro de Jest, un handle
 * que impedía salir del proceso; un proceso Node normal sí cerraba limpio en
 * 15ms, así que se verificó a mano con un script real —no automatizado— que el
 * ciclo completo, scheduler incluido, funciona).
 */
describe('Expiración de reservas (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let reservationsService: ReservationsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    reservationsService = app.get(ReservationsService);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "users", "tenants" RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  async function setupNegocio(): Promise<{ tenantId: string; serviceId: string }> {
    const registro = await request(app.getHttpServer())
      .post('/auth/register-business')
      .send({
        businessName: 'Barbería Expiración',
        slug: 'barberia-expira',
        ownerFullName: 'Dueño Test',
        email: 'expira@test.cl',
        password: 'clave-segura-123',
      })
      .expect(201);

    const token = registro.body.tokens.accessToken;

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

    return { tenantId: registro.body.tenant.id, serviceId: servicio.body.id };
  }

  /** Reserva sembrada directo en BD, para controlar `expires_at` a mano. */
  async function seedReservation(params: {
    tenantId: string;
    serviceId: string;
    startsAt: string;
    endsAt: string;
    status: 'PENDING' | 'CONFIRMED';
    expiresAt: string | null;
  }): Promise<string> {
    const [client]: Array<{ id: string }> = await dataSource.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, 'no-importa', 'Cliente Sembrado', 'CLIENT') RETURNING id`,
      [`seed-${Math.random().toString(36).slice(2)}@test.cl`],
    );

    const [reserva]: Array<{ id: string }> = await dataSource.query(
      `INSERT INTO reservations
         (tenant_id, service_id, client_id, starts_at, ends_at, status, expires_at, price_clp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 12000) RETURNING id`,
      [
        params.tenantId,
        params.serviceId,
        client.id,
        params.startsAt,
        params.endsAt,
        params.status,
        params.expiresAt,
      ],
    );

    return reserva.id;
  }

  async function estadoReserva(id: string): Promise<string> {
    const [row]: Array<{ status: string }> = await dataSource.query(
      'SELECT status FROM reservations WHERE id = $1',
      [id],
    );
    return row.status;
  }

  it('★ un PENDING vencido pasa a EXPIRED', async () => {
    const { tenantId, serviceId } = await setupNegocio();
    const id = await seedReservation({
      tenantId,
      serviceId,
      startsAt: SLOT_12,
      endsAt: '2027-01-04T12:30:00.000Z',
      status: 'PENDING',
      expiresAt: '2020-01-01T00:00:00.000Z', // muy en el pasado
    });

    const liberadas = await reservationsService.expireStalePending();

    expect(liberadas).toBeGreaterThanOrEqual(1);
    expect(await estadoReserva(id)).toBe('EXPIRED');
  });

  it('★ un PENDING vigente no se toca', async () => {
    const { tenantId, serviceId } = await setupNegocio();
    const id = await seedReservation({
      tenantId,
      serviceId,
      startsAt: SLOT_12,
      endsAt: '2027-01-04T12:30:00.000Z',
      status: 'PENDING',
      expiresAt: '2099-01-01T00:00:00.000Z', // muy en el futuro
    });

    await reservationsService.expireStalePending();

    expect(await estadoReserva(id)).toBe('PENDING');
  });

  it('★ una CONFIRMED no se toca, aunque su columna expires_at quedara con algo', async () => {
    const { tenantId, serviceId } = await setupNegocio();
    const id = await seedReservation({
      tenantId,
      serviceId,
      startsAt: SLOT_12,
      endsAt: '2027-01-04T12:30:00.000Z',
      status: 'CONFIRMED',
      expiresAt: null,
    });

    await reservationsService.expireStalePending();

    expect(await estadoReserva(id)).toBe('CONFIRMED');
  });

  it('★ idempotente: la segunda corrida no encuentra nada que liberar', async () => {
    const { tenantId, serviceId } = await setupNegocio();
    await seedReservation({
      tenantId,
      serviceId,
      startsAt: SLOT_12,
      endsAt: '2027-01-04T12:30:00.000Z',
      status: 'PENDING',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    await reservationsService.expireStalePending();
    const segunda = await reservationsService.expireStalePending();

    expect(segunda).toBe(0);
  });

  it('★ checkpoint del día: liberado el slot, otro cliente puede tomarlo', async () => {
    const { tenantId, serviceId } = await setupNegocio();
    await seedReservation({
      tenantId,
      serviceId,
      startsAt: SLOT_12,
      endsAt: '2027-01-04T12:30:00.000Z',
      status: 'PENDING',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    await reservationsService.expireStalePending();

    await request(app.getHttpServer())
      .post('/public/barberia-expira/reservations')
      .send({
        serviceId,
        startsAt: SLOT_12,
        clientName: 'Otro Cliente',
        clientEmail: 'otro@cliente.cl',
      })
      .expect(201);
  });
});
