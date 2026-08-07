import { Injectable } from '@nestjs/common';

import { ConcurrencyLimiter } from './concurrency-limiter';
import { DEFAULT_RETRY_OPTIONS, retryWithBackoff } from './gemini-retry';
import type { GeminiResult } from './gemini.client';
import { GeminiClient, GoogleGeminiClient } from './gemini.client';

/** Como máximo 3 llamadas a Gemini a la vez desde este proceso — suficiente para el tráfico de una demo. */
const MAX_CONCURRENT_CALLS = 3;

/**
 * Decorador sobre `GeminiClient` (día 12, parte 1): agrega límite de
 * concurrencia + reintento con backoff y jitter alrededor del cliente real,
 * sin que `AiService` ni los tests existentes se enteren — siguen viendo el
 * mismo `GeminiClient` abstracto. `GoogleGeminiClient` (el SDK crudo) se
 * inyecta directo, no por el token abstracto: si se inyectara `GeminiClient`
 * acá adentro, apuntaría a este mismo decorador (se provee bajo ese token) y
 * quedaría en referencia circular.
 */
@Injectable()
export class ResilientGeminiClient extends GeminiClient {
  private readonly limiter = new ConcurrencyLimiter(MAX_CONCURRENT_CALLS);

  constructor(private readonly inner: GoogleGeminiClient) {
    super();
  }

  async send(params: Parameters<GeminiClient['send']>[0]): Promise<GeminiResult> {
    return this.limiter.run(() => retryWithBackoff(() => this.inner.send(params), DEFAULT_RETRY_OPTIONS));
  }
}
