/**
 * Semáforo simple en memoria: como máximo `max` tareas corriendo a la vez,
 * el resto espera su turno en una cola de promesas. No es un rate limiter de
 * producción (no persiste entre restarts, no reparte entre réplicas) —
 * alcanza para no mandar ráfagas de requests simultáneas a Gemini desde un
 * solo proceso.
 */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();

    if (next) {
      next();
    }
  }
}
