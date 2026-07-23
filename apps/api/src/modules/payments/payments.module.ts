import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReservationsModule } from '../reservations/reservations.module';
import { TenantsModule } from '../tenants/tenants.module';
import { Payment } from './entities/payment.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { TransbankWebpayClient, WebpayClient } from './webpay.client';

/**
 * Depende de `reservations` (dirección permitida en `02-arquitectura.md`) para
 * confirmar la reserva tras el pago. `reservations` no lo conoce a él.
 *
 * `WebpayClient` se provee por su clase abstracta: el servicio depende de la
 * frontera, no del SDK, y los tests inyectan un doble sin tocar la red.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Payment]), TenantsModule, ReservationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, { provide: WebpayClient, useClass: TransbankWebpayClient }],
  exports: [PaymentsService],
})
export class PaymentsModule {}
