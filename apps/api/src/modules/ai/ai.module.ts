import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { GeminiClient, GoogleGeminiClient } from './gemini.client';
import { ResilientGeminiClient } from './resilient-gemini.client';

/**
 * Importa `catalog` y `tenants` — misma dirección que ya usa
 * `ReservationsModule` (`02-arquitectura.md`). No importa `reservations`:
 * la parte 1 no crea reservas, solo consulta y valida (adr/0004).
 *
 * `GeminiClient` (el token que usa `AiService`) se provee como
 * `ResilientGeminiClient`, que envuelve a `GoogleGeminiClient` (provisto
 * bajo su propia clase) con concurrencia + reintento — día 12, parte 1.
 */
@Module({
  imports: [TenantsModule, CatalogModule],
  controllers: [AiController],
  providers: [
    AiService,
    GoogleGeminiClient,
    { provide: GeminiClient, useClass: ResilientGeminiClient },
  ],
})
export class AiModule {}
