export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = { maxAttempts: 3, baseDelayMs: 500 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `base * 2^intento` más un jitter aleatorio (0 a la mitad del delay) para no sincronizar reintentos. */
export function backoffDelayMs(attempt: number, baseDelayMs: number): number {
  const exponential = baseDelayMs * 2 ** attempt;
  return exponential + Math.random() * exponential * 0.5;
}

/**
 * Reintenta `fn` ante cualquier error (429 de Gemini incluido — el SDK no
 * distingue el caso con un tipo propio que valga la pena acoplarse, y el
 * resto de los fallos transitorios de red merecen el mismo tratamiento) con
 * backoff exponencial y jitter. Sin loop abierto: agotados los intentos,
 * relanza el último error para que quien llama decida (acá, degradación
 * elegante en `AiService`).
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < options.maxAttempts - 1) {
        await sleep(backoffDelayMs(attempt, options.baseDelayMs));
      }
    }
  }

  throw lastError;
}
