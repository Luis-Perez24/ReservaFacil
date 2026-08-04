import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { RealtimeGateway } from '../src/modules/realtime/realtime.gateway';

/** Lunes de verano chileno (UTC-3), lejano para que el filtro de "solo futuros" no lo toque. */
const MONDAY = 1;
const SLOT_12 = '2027-01-04T12:00:00.000Z';

/**
 * El aviso en vivo viaja del núcleo al canal de Socket.IO por un evento, no por
 * una llamada directa: `reservations` no conoce a `realtime` (`adr/0001`), lo
 * anuncia y alguien escucha.
 *
 * Ese desacople tiene un costo: nada rompe en tiempo de compilación si el
 * listener deja de estar registrado. Un `@OnEvent` que nadie instancia falla en
 * silencio y la agenda simplemente deja de refrescarse. Este test cubre la
 * costura entera —POST real → evento → gateway— que es justo lo que el
 * compilador no puede cuidar.
 */
describe('Realtime (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let emitSlotTaken: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    // Se espía el gateway y no el socket: lo que importa es que el aviso llegue
    // hasta acá. Que Socket.IO entregue el mensaje es asunto de la librería.
    emitSlotTaken = jest.spyOn(app.get(RealtimeGateway), 'emitSlotTaken').mockImplementation();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "users", "tenants" RESTART IDENTITY CASCADE');
    emitSlotTaken.mockClear();
  });

  afterAll(async () => {
    emitSlotTaken.mockRestore();
    await app.close();
  });

  async function setupNegocio(): Promise<string> {
    const registro = await request(app.getHttpServer())
      .post('/auth/register-business')
      .send({
        businessName: 'Barbería A',
        slug: 'barberia-a',
        ownerFullName: 'Dueño Test',
        email: 'a@test.cl',
        password: 'clave-segura-123',
      })
      .expect(201);

    const token: string = registro.body.tokens.accessToken;

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

    return servicio.body.id;
  }

  it('★ reservar avisa al canal en vivo con el slug y el slot tomados', async () => {
    const serviceId = await setupNegocio();

    await request(app.getHttpServer())
      .post('/public/barberia-a/reservations')
      .send({
        serviceId,
        startsAt: SLOT_12,
        clientName: 'Cliente Test',
        clientEmail: 'cliente@test.cl',
      })
      .expect(201);

    expect(emitSlotTaken).toHaveBeenCalledTimes(1);
    expect(emitSlotTaken).toHaveBeenCalledWith('barberia-a', {
      serviceId,
      startsAt: SLOT_12,
    });
  });

  it('★ una reserva rechazada no avisa nada', async () => {
    const serviceId = await setupNegocio();

    // Slot fuera del horario publicado: la reserva no llega a existir, así que
    // nadie debería anunciar que el slot se ocupó.
    await request(app.getHttpServer())
      .post('/public/barberia-a/reservations')
      .send({
        serviceId,
        startsAt: '2027-01-04T23:00:00.000Z',
        clientName: 'Cliente Test',
        clientEmail: 'cliente@test.cl',
      })
      .expect(409);

    expect(emitSlotTaken).not.toHaveBeenCalled();
  });
});
