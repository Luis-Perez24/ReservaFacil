import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import type { EnvironmentVariables } from './infra/config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      // Descarta cualquier propiedad que el DTO no declare.
      whitelist: true,
      // Y si viene una de más, falla en vez de ignorarla en silencio: un campo
      // que el cliente cree estar mandando y el server descarta es un bug mudo.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = app.get(ConfigService<EnvironmentVariables, true>);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ReservaFácil API')
    .setDescription('SaaS multi-tenant de reservas de horas')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
