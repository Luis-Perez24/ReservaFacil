import { backoffDelayMs, retryWithBackoff } from './gemini-retry';

describe('retryWithBackoff', () => {
  it('devuelve el resultado sin reintentar si el primer intento funciona', async () => {
    const fn = jest.fn().mockResolvedValue('ok');

    const resultado = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 });

    expect(resultado).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reintenta hasta que funciona, sin superar maxAttempts', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('429'))
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValue('ok');

    const resultado = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 });

    expect(resultado).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('agota los intentos y relanza el último error', async () => {
    const error = new Error('Gemini no responde');
    const fn = jest.fn().mockRejectedValue(error);

    await expect(retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toThrow(
      'Gemini no responde',
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('backoffDelayMs', () => {
  it('crece exponencialmente y el jitter nunca baja del piso exponencial', () => {
    const base = 100;

    for (let intento = 0; intento < 4; intento++) {
      const exponencial = base * 2 ** intento;
      const muestras = Array.from({ length: 20 }, () => backoffDelayMs(intento, base));

      for (const delay of muestras) {
        expect(delay).toBeGreaterThanOrEqual(exponencial);
        expect(delay).toBeLessThanOrEqual(exponencial * 1.5);
      }
    }
  });
});
