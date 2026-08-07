import { validateEnv } from './env.validation';

const envValido = {
  NODE_ENV: 'development',
  PORT: '3000',
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5432',
  POSTGRES_USER: 'reservafacil',
  POSTGRES_PASSWORD: 'secreto',
  POSTGRES_DB: 'reservafacil',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_SECRET: 'b'.repeat(64),
  JWT_REFRESH_TTL: '7d',
  TRANSBANK_COMMERCE_CODE: '597055555532',
  TRANSBANK_API_KEY: 'd'.repeat(64),
  TRANSBANK_ENVIRONMENT: 'integration',
  TRANSBANK_RETURN_URL: 'http://localhost:3000/payments/webpay/return',
  WEB_BASE_URL: 'http://localhost:4200',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM: 'ReservaFácil <no-reply@reservafacil.cl>',
  GEMINI_API_KEY: 'e'.repeat(32),
};

describe('validateEnv', () => {
  it('convierte los números a number', () => {
    const env = validateEnv(envValido);

    expect(env.PORT).toBe(3000);
    expect(env.POSTGRES_PORT).toBe(5432);
  });

  it('falla si falta una variable', () => {
    const { JWT_ACCESS_SECRET, ...incompleto } = envValido;

    expect(() => validateEnv(incompleto)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rechaza un secreto JWT corto', () => {
    expect(() => validateEnv({ ...envValido, JWT_ACCESS_SECRET: 'corto' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('rechaza usar el mismo secreto para access y refresh', () => {
    // Con un solo secreto, un refresh token robado sirve para firmar access
    // tokens: el TTL corto del access dejaría de significar nada.
    const mismoSecreto = 'c'.repeat(64);

    expect(() =>
      validateEnv({
        ...envValido,
        JWT_ACCESS_SECRET: mismoSecreto,
        JWT_REFRESH_SECRET: mismoSecreto,
      }),
    ).toThrow(/distintos/);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => validateEnv({ ...envValido, NODE_ENV: 'produccion' })).toThrow(/NODE_ENV/);
  });

  it('rechaza un ambiente de Transbank desconocido', () => {
    // Un typo acá apuntaría los pagos al ambiente equivocado: mejor no arrancar.
    expect(() => validateEnv({ ...envValido, TRANSBANK_ENVIRONMENT: 'sandbox' })).toThrow(
      /TRANSBANK_ENVIRONMENT/,
    );
  });
});
