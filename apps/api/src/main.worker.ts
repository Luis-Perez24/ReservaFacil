import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

/**
 * El mismo monolito, otro entrypoint (`02-arquitectura.md`): mismo código,
 * misma BD, mismos módulos — sin servidor HTTP, solo consumiendo BullMQ.
 *
 * `WORKER_MODE=true` es lo único que distingue este proceso del de `main.ts`:
 * es lo que hace que `ReminderProcessor` no se quede pausado (ver su comentario).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);

  app.enableShutdownHooks();
}

void bootstrap();
