import { ConcurrencyLimiter } from './concurrency-limiter';

describe('ConcurrencyLimiter', () => {
  it('deja correr hasta `max` tareas a la vez', async () => {
    const limiter = new ConcurrencyLimiter(2);
    let enVuelo = 0;
    let maxObservado = 0;

    const tarea = () =>
      limiter.run(async () => {
        enVuelo++;
        maxObservado = Math.max(maxObservado, enVuelo);
        await new Promise((resolve) => setTimeout(resolve, 20));
        enVuelo--;
        return 'ok';
      });

    await Promise.all([tarea(), tarea(), tarea(), tarea()]);

    expect(maxObservado).toBeLessThanOrEqual(2);
  });

  it('la tarea de más espera hasta que se libera un cupo', async () => {
    const limiter = new ConcurrencyLimiter(1);
    const orden: string[] = [];

    let liberarPrimera: () => void = () => {};
    const primera = limiter.run(async () => {
      orden.push('primera-empieza');
      await new Promise<void>((resolve) => {
        liberarPrimera = resolve;
      });
      orden.push('primera-termina');
    });

    // La segunda no debería poder empezar mientras la primera sigue con el cupo.
    const segunda = limiter.run(async () => {
      orden.push('segunda-empieza');
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(orden).toEqual(['primera-empieza']);

    liberarPrimera();
    await Promise.all([primera, segunda]);

    expect(orden).toEqual(['primera-empieza', 'primera-termina', 'segunda-empieza']);
  });

  it('libera el cupo aunque la tarea falle', async () => {
    const limiter = new ConcurrencyLimiter(1);

    await expect(limiter.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

    // Si el cupo no se hubiera liberado, esto quedaría colgado.
    const resultado = await limiter.run(() => Promise.resolve('ok'));
    expect(resultado).toBe('ok');
  });
});
