import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtPayload, UserRole } from '@reservafacil/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/modules/auth/password.service';

const negocio = {
  businessName: 'Barbería Don Lucho',
  slug: 'barberia-don-lucho',
  ownerFullName: 'Lucho Pérez',
  email: 'lucho@barberia.cl',
  password: 'clave-segura-123',
};

/** Los claims sin verificar la firma: es lo que el cliente puede leer. */
function decodePayload(token: string): JwtPayload {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as JwtPayload;
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    // El mismo pipe que main.ts: un e2e que valida distinto que producción no
    // prueba producción.
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

  describe('POST /auth/register-business', () => {
    it('registra el negocio con su dueño', async () => {
      const respuesta = await request(app.getHttpServer())
        .post('/auth/register-business')
        .send(negocio)
        .expect(201);

      expect(respuesta.body.tenant).toMatchObject({
        slug: 'barberia-don-lucho',
        name: 'Barbería Don Lucho',
        timezone: 'America/Santiago',
      });
      expect(respuesta.body.user).toMatchObject({
        email: 'lucho@barberia.cl',
        role: UserRole.OWNER,
      });
      expect(respuesta.body.user.tenantId).toBe(respuesta.body.tenant.id);
    });

    it('nunca devuelve el hash de la contraseña', async () => {
      const respuesta = await request(app.getHttpServer())
        .post('/auth/register-business')
        .send(negocio)
        .expect(201);

      expect(JSON.stringify(respuesta.body)).not.toContain('argon2');
      expect(respuesta.body.user.passwordHash).toBeUndefined();
    });

    it('rechaza un slug ya tomado con 409', async () => {
      await request(app.getHttpServer()).post('/auth/register-business').send(negocio).expect(201);

      await request(app.getHttpServer())
        .post('/auth/register-business')
        .send({ ...negocio, email: 'otro@barberia.cl' })
        .expect(409);
    });

    it('no deja el negocio creado si el usuario falla', async () => {
      // El hash corre dentro de la transacción, después de crear el tenant:
      // hacerlo reventar es la forma determinista de probar el rollback.
      const passwordService = app.get(PasswordService);
      const spy = jest.spyOn(passwordService, 'hash').mockRejectedValueOnce(new Error('boom'));

      try {
        await request(app.getHttpServer())
          .post('/auth/register-business')
          .send({ ...negocio, slug: 'negocio-fantasma' })
          .expect(500);

        // La transacción revirtió: el negocio del intento fallido no quedó.
        const tenants = await dataSource.query('SELECT slug FROM "tenants" WHERE slug = $1', [
          'negocio-fantasma',
        ]);
        expect(tenants).toHaveLength(0);
      } finally {
        spy.mockRestore();
      }
    });

    it('rechaza un slug con formato inválido con 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register-business')
        .send({ ...negocio, slug: 'Barbería Don Lucho' })
        .expect(400);
    });

    it('rechaza propiedades no declaradas con 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register-business')
        .send({ ...negocio, role: UserRole.OWNER })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post('/auth/register-business').send(negocio).expect(201);
    });

    it('el access token trae el tenant y el rol', async () => {
      const respuesta = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: negocio.email, password: negocio.password })
        .expect(200);

      const payload = decodePayload(respuesta.body.tokens.accessToken);

      expect(payload.role).toBe(UserRole.OWNER);
      expect(payload.tenantId).toBe(respuesta.body.user.tenantId);
      expect(payload.sub).toBe(respuesta.body.user.id);
    });

    it('el access token no lleva PII', async () => {
      const respuesta = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: negocio.email, password: negocio.password })
        .expect(200);

      const payload = decodePayload(respuesta.body.tokens.accessToken);

      expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'role', 'sub', 'tenantId']);
    });

    it('rechaza una contraseña incorrecta con 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: negocio.email, password: 'clave-equivocada' })
        .expect(401);
    });

    it('responde igual para un email que no existe', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nadie@ninguna.cl', password: negocio.password })
        .expect(401);
    });

    it('pide el slug si el email está en varios negocios', async () => {
      await request(app.getHttpServer())
        .post('/auth/register-business')
        .send({ ...negocio, slug: 'barberia-del-centro' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: negocio.email, password: negocio.password })
        .expect(409);

      const respuesta = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: negocio.email, password: negocio.password, slug: 'barberia-del-centro' })
        .expect(200);

      expect(respuesta.body.tenant?.slug ?? respuesta.body.user.tenantId).toBeDefined();
    });
  });

  describe('GET /auth/me', () => {
    let accessToken: string;

    beforeEach(async () => {
      const respuesta = await request(app.getHttpServer())
        .post('/auth/register-business')
        .send(negocio)
        .expect(201);

      accessToken = respuesta.body.tokens.accessToken;
    });

    it('devuelve el usuario del token', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(respuesta.body).toMatchObject({
        email: negocio.email,
        fullName: negocio.ownerFullName,
        role: UserRole.OWNER,
      });
    });

    it('rechaza sin token con 401', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('rechaza un token con firma falsa con 401', async () => {
      const [header, payload] = accessToken.split('.');

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${header}.${payload}.firma-inventada`)
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('entrega un access token nuevo', async () => {
      const registro = await request(app.getHttpServer())
        .post('/auth/register-business')
        .send(negocio)
        .expect(201);

      const respuesta = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: registro.body.tokens.refreshToken })
        .expect(200);

      const payload = decodePayload(respuesta.body.accessToken);

      expect(payload.sub).toBe(registro.body.user.id);
      expect(payload.role).toBe(UserRole.OWNER);
    });

    it('no acepta el access token como refresh', async () => {
      const registro = await request(app.getHttpServer())
        .post('/auth/register-business')
        .send(negocio)
        .expect(201);

      // Están firmados con secretos distintos justamente para esto.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: registro.body.tokens.accessToken })
        .expect(401);
    });
  });

  describe('GET /tenants/me', () => {
    it('devuelve el negocio del token', async () => {
      const registro = await request(app.getHttpServer())
        .post('/auth/register-business')
        .send(negocio)
        .expect(201);

      const respuesta = await request(app.getHttpServer())
        .get('/tenants/me')
        .set('Authorization', `Bearer ${registro.body.tokens.accessToken}`)
        .expect(200);

      expect(respuesta.body).toMatchObject({
        id: registro.body.tenant.id,
        slug: negocio.slug,
      });
    });

    it('cada negocio recibe el suyo y no el del otro', async () => {
      const primero = await request(app.getHttpServer())
        .post('/auth/register-business')
        .send(negocio)
        .expect(201);

      const segundo = await request(app.getHttpServer())
        .post('/auth/register-business')
        .send({
          ...negocio,
          slug: 'veterinaria-san-jose',
          businessName: 'Veterinaria San José',
          email: 'ana@veterinaria.cl',
        })
        .expect(201);

      const respuesta = await request(app.getHttpServer())
        .get('/tenants/me')
        .set('Authorization', `Bearer ${segundo.body.tokens.accessToken}`)
        .expect(200);

      expect(respuesta.body.id).toBe(segundo.body.tenant.id);
      expect(respuesta.body.id).not.toBe(primero.body.tenant.id);
    });

    it('rechaza sin token con 401', async () => {
      await request(app.getHttpServer()).get('/tenants/me').expect(401);
    });
  });
});
