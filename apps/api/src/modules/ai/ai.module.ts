import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { GeminiClient, GoogleGeminiClient } from './gemini.client';

/**
 * Importa `catalog` y `tenants` — misma dirección que ya usa
 * `ReservationsModule` (`02-arquitectura.md`). No importa `reservations`:
 * la parte 1 no crea reservas, solo consulta y valida (adr/0004).
 */
@Module({
  imports: [TenantsModule, CatalogModule],
  controllers: [AiController],
  providers: [AiService, { provide: GeminiClient, useClass: GoogleGeminiClient }],
})
export class AiModule {}
