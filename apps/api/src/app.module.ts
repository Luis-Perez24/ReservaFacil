import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'node:path';

import { EnvironmentVariables, validateEnv } from './infra/config/env.validation';
import { buildTypeOrmOptions } from './infra/db/typeorm-options';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { TenantsModule } from './modules/tenants/tenants.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // El .env vive en la raíz del monorepo. En Docker (Día 6) no habrá
      // archivo: las variables llegan del entorno y ConfigModule las toma igual.
      envFilePath: resolve(process.cwd(), '../../.env'),
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        buildTypeOrmOptions({
          POSTGRES_HOST: config.get('POSTGRES_HOST', { infer: true }),
          POSTGRES_PORT: config.get('POSTGRES_PORT', { infer: true }),
          POSTGRES_USER: config.get('POSTGRES_USER', { infer: true }),
          POSTGRES_PASSWORD: config.get('POSTGRES_PASSWORD', { infer: true }),
          POSTGRES_DB: config.get('POSTGRES_DB', { infer: true }),
        }),
    }),
    // Solo `reservations` emite y solo `notifications` escucha, hoy. Global
    // para no repetir `EventEmitterModule.forRoot()` si mañana otro módulo
    // también necesita emitir o escuchar.
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        connection: {
          host: config.get('REDIS_HOST', { infer: true }),
          port: config.get('REDIS_PORT', { infer: true }),
        },
      }),
    }),
    AuthModule,
    TenantsModule,
    CatalogModule,
    RealtimeModule,
    ReservationsModule,
    PaymentsModule,
    NotificationsModule,
  ],
})
export class AppModule {}
