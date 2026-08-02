import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { TenantsModule } from '../tenants/tenants.module';
import { EmailChannel } from './channels/email.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';
import { Reminder } from './entities/reminder.entity';
import { ReminderProcessor } from './reminder.processor';
import { ReminderScheduler } from './reminder-scheduler';
import { REMINDERS_QUEUE } from './reminders.queue';
import { RemindersService } from './reminders.service';

/**
 * `notifications → reservations` está en la tabla de dependencias de
 * `02-arquitectura.md`; `→ catalog`, `→ tenants` y `→ auth` no estaban ahí
 * —el doc no llegó a cubrir de dónde sale el nombre del servicio, el nombre
 * del negocio o el contacto del cliente para armar el mensaje—. Se avisó
 * antes de escribir el código; las tres son lecturas vía el servicio
 * exportado de cada módulo, no imports de internals.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Reminder]),
    BullModule.registerQueue({ name: REMINDERS_QUEUE }),
    ReservationsModule,
    TenantsModule,
    CatalogModule,
    AuthModule,
  ],
  providers: [RemindersService, ReminderScheduler, ReminderProcessor, EmailChannel, WhatsappChannel],
})
export class NotificationsModule {}
