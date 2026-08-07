import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import type { GeminiContent, GeminiResult } from '../src/modules/ai/gemini.client';
import { GeminiClient } from '../src/modules/ai/gemini.client';

const FUTURE_MONDAY = '2027-01-04';
const MONDAY = 1;
const SLOT_9 = '2027-01-04T12:00:00.000Z'; // 09:00 local (America/Santiago, UTC-3)

/**
 * Doble de Gemini: nunca habla con Google, devuelve una cola de respuestas
 * programadas por el test (mismo patrón que `FakeWebpayClient` en
 * `payments.e2e-spec.ts`) y registra los `contents` de cada llamada, para
 * poder afirmar qué le llegó de vuelta a "Gemini" tras ejecutar la función —
 * ahí es donde se verifica que los datos son reales, no inventados.
 */
class FakeGeminiClient extends GeminiClient {
  responses: GeminiResult[] = [];
  calls: Array<{ contents: GeminiContent[] }> = [];

  async send(params: { contents: GeminiContent[] }): Promise<GeminiResult> {
    this.calls.push({ contents: params.contents });
    const next = this.responses.shift();

    if (!next) {
      throw new Error('FakeGeminiClient sin respuesta programada para esta llamada');
    }

    return next;
  }
}

describe('AI chat (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const gemini = new FakeGeminiClient();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GeminiClient)
      .useValue(gemini)
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
    gemini.responses = [];
    gemini.calls = [];
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

  /** Negocio con un servicio "Corte de pelo" y regla lunes 09:00–11:00. */
  async function setupNegocio(
    slug: string,
    email: string,
    priceClp = 12000,
  ): Promise<{ token: string; tenantId: string; serviceId: string }> {
    const { token, tenantId } = await registerBusiness(slug, email);

    const servicio = await request(app.getHttpServer())
      .post('/services')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corte de pelo', durationMin: 30, priceClp })
      .expect(201);

    await request(app.getHttpServer())
      .post('/availability/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ dayOfWeek: MONDAY, startTime: '09:00', endTime: '11:00', slotIntervalMin: 30 })
      .expect(201);

    return { token, tenantId, serviceId: servicio.body.id };
  }

  function ultimaFunctionResponse(): Record<string, unknown> {
    const ultimaLlamada = gemini.calls.at(-1);
    const parte = ultimaLlamada?.contents.find((c) => c.functionResponse)?.functionResponse;

    if (!parte) {
      throw new Error('Ninguna llamada a Gemini incluyó un functionResponse');
    }
    return parte.response;
  }

  describe('consultar_disponibilidad', () => {
    it('ejecuta la función real y le devuelve a Gemini los slots reales de la BD, no inventados', async () => {
      await setupNegocio('barberia-ai-a', 'a-ai@test.cl');

      gemini.responses = [
        {
          kind: 'function_call',
          name: 'consultar_disponibilidad',
          args: { servicio: 'corte', fecha: FUTURE_MONDAY },
        },
        { kind: 'text', text: 'Tienes horarios libres el lunes en la mañana.' },
      ];

      const respuesta = await request(app.getHttpServer())
        .post('/public/barberia-ai-a/chat')
        .send({ message: 'quiero corte el lunes' })
        .expect(201);

      expect(respuesta.body.reply).toBe('Tienes horarios libres el lunes en la mañana.');

      const funcionEjecutada = ultimaFunctionResponse();
      expect(funcionEjecutada['servicio']).toBe('Corte de pelo');
      expect(funcionEjecutada['slots']).toEqual(
        expect.arrayContaining([expect.objectContaining({ startsAt: SLOT_9 })]),
      );
    });

    it('aísla los datos entre tenants: cada uno ve solo su propio catálogo/disponibilidad', async () => {
      await setupNegocio('barberia-ai-b', 'b-ai@test.cl', 20000);
      const negocioC = await setupNegocio('barberia-ai-c', 'c-ai@test.cl', 30000);

      gemini.responses = [
        {
          kind: 'function_call',
          name: 'consultar_disponibilidad',
          args: { servicio: 'corte', fecha: FUTURE_MONDAY },
        },
        { kind: 'text', text: 'ok' },
      ];

      await request(app.getHttpServer())
        .post('/public/barberia-ai-c/chat')
        .send({ message: 'quiero corte el lunes' })
        .expect(201);

      const funcionEjecutada = ultimaFunctionResponse();
      expect(funcionEjecutada['servicioId']).toBe(negocioC.serviceId);
    });
  });

  describe('crear_reserva_tentativa', () => {
    it('no confirma un horario que ya no está disponible, y nunca inserta una reserva', async () => {
      const negocio = await setupNegocio('barberia-ai-d', 'd-ai@test.cl');

      // Ocupa el slot directo en BD, como si otro cliente ya lo hubiera tomado.
      const [cliente]: Array<{ id: string }> = await dataSource.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ('cliente-ocupado@test.cl', 'no-importa', 'Cliente', 'CLIENT') RETURNING id`,
      );
      await dataSource.query(
        `INSERT INTO reservations (tenant_id, service_id, client_id, starts_at, ends_at, status, price_clp)
         VALUES ($1, $2, $3, $4, $5, 'CONFIRMED', 12000)`,
        [negocio.tenantId, negocio.serviceId, cliente.id, SLOT_9, '2027-01-04T12:30:00.000Z'],
      );

      gemini.responses = [
        {
          kind: 'function_call',
          name: 'crear_reserva_tentativa',
          args: { servicioId: negocio.serviceId, startsAt: SLOT_9 },
        },
        { kind: 'text', text: 'Ese horario ya no está disponible.' },
      ];

      await request(app.getHttpServer())
        .post('/public/barberia-ai-d/chat')
        .send({ message: 'confirma el lunes a las 9' })
        .expect(201);

      const funcionEjecutada = ultimaFunctionResponse();
      expect(funcionEjecutada['disponible']).toBe(false);

      const [{ count }]: Array<{ count: string }> = await dataSource.query(
        `SELECT count(*)::int AS count FROM reservations WHERE tenant_id = $1`,
        [negocio.tenantId],
      );
      expect(Number(count)).toBe(1); // solo la sembrada a mano, ninguna creada por el chat
    });

    it('confirma un horario que sigue libre, con el precio real del catálogo', async () => {
      const negocio = await setupNegocio('barberia-ai-e', 'e-ai@test.cl', 15000);

      gemini.responses = [
        {
          kind: 'function_call',
          name: 'crear_reserva_tentativa',
          args: { servicioId: negocio.serviceId, startsAt: SLOT_9 },
        },
        { kind: 'text', text: 'Perfecto, tu horario es el lunes a las 9.' },
      ];

      await request(app.getHttpServer())
        .post('/public/barberia-ai-e/chat')
        .send({ message: 'confirma el lunes a las 9' })
        .expect(201);

      const funcionEjecutada = ultimaFunctionResponse();
      expect(funcionEjecutada['disponible']).toBe(true);
      expect(funcionEjecutada['precioClp']).toBe(15000);
    });
  });

  it('404 si el negocio no existe', async () => {
    await request(app.getHttpServer())
      .post('/public/no-existe/chat')
      .send({ message: 'hola' })
      .expect(404);
  });
});
