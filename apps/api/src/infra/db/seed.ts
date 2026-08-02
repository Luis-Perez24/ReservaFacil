import { PaymentStatus, ReservationStatus, UserRole } from '@reservafacil/contracts';
import * as argon2 from 'argon2';
import { IsNull } from 'typeorm';
import type { DataSource, EntityManager } from 'typeorm';

import { User } from '../../modules/auth/entities/user.entity';
import { AvailabilityException } from '../../modules/catalog/entities/availability-exception.entity';
import { AvailabilityRule } from '../../modules/catalog/entities/availability-rule.entity';
import { Service } from '../../modules/catalog/entities/service.entity';
// Función pura del módulo de pagos. El seed escribe directo en las tablas —ya
// está por debajo de la frontera entre módulos—, y replicar acá el formato del
// buy_order sería tener dos definiciones de lo mismo esperando a divergir.
import { buildBuyOrder } from '../../modules/payments/buy-order';
import { Payment } from '../../modules/payments/entities/payment.entity';
import { Reservation } from '../../modules/reservations/entities/reservation.entity';
import { Tenant } from '../../modules/tenants/entities/tenant.entity';
import dataSource from './data-source';
import { DEMO_BUSINESSES, DEMO_CLIENTS, DEMO_PASSWORD } from './seed-data';
import type { SeedBusiness } from './seed-data';
import { RANDOM_SEED, createRandom, planReservations } from './seed-plan';

/**
 * Siembra los negocios de demostración.
 *
 * Es **idempotente**: cada corrida borra los negocios de demostración y los
 * vuelve a escribir, así que correrlo dos veces deja la base igual que
 * correrlo una. Y es **determinista** —el azar sale de una semilla fija—, de
 * modo que las métricas de la demo no cambian entre corridas.
 *
 * Escribe con el repositorio y no llamando a la API porque necesita historia:
 * reservas de hace seis semanas ya atendidas, que por la API habría que crear
 * hoy y pagar una por una.
 */


/**
 * Borra todo rastro del negocio, en orden inverso a las claves foráneas. Las
 * tablas no tienen ON DELETE CASCADE a propósito: que borrar exija nombrar cada
 * tabla evita que un borrado distraído se lleve por delante lo que no debía.
 */
async function purgeBusiness(manager: EntityManager, slug: string): Promise<void> {
  const tenant = await manager.getRepository(Tenant).findOneBy({ slug });

  if (!tenant) {
    return;
  }

  const tenantId = tenant.id;

  await manager.query('DELETE FROM reminders WHERE tenant_id = $1', [tenantId]);
  await manager.query('DELETE FROM payments WHERE tenant_id = $1', [tenantId]);
  await manager.query('DELETE FROM idempotency_keys WHERE tenant_id = $1', [tenantId]);
  await manager.query('DELETE FROM reservations WHERE tenant_id = $1', [tenantId]);
  await manager.query('DELETE FROM availability_exceptions WHERE tenant_id = $1', [tenantId]);
  await manager.query('DELETE FROM availability_rules WHERE tenant_id = $1', [tenantId]);
  await manager.query('DELETE FROM services WHERE tenant_id = $1', [tenantId]);
  await manager.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
  await manager.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
}

/** Los clientes son de la plataforma, no de un negocio: se actualizan, no se borran. */
async function upsertClients(manager: EntityManager, passwordHash: string): Promise<User[]> {
  const repository = manager.getRepository(User);
  const clients: User[] = [];

  for (const client of DEMO_CLIENTS) {
    const existing = await repository.findOneBy({ email: client.email, tenantId: IsNull() });

    clients.push(
      await repository.save(
        repository.create({
          ...existing,
          tenantId: null,
          email: client.email,
          fullName: client.fullName,
          phone: client.phone,
          passwordHash,
          role: UserRole.CLIENT,
          active: true,
        }),
      ),
    );
  }

  return clients;
}

async function seedBusiness(
  manager: EntityManager,
  business: SeedBusiness,
  clients: User[],
  passwordHash: string,
  random: () => number,
): Promise<number> {
  await purgeBusiness(manager, business.slug);

  const tenant = await manager.getRepository(Tenant).save(
    manager.getRepository(Tenant).create({
      name: business.name,
      slug: business.slug,
      timezone: business.timezone,
      branding: business.branding,
      active: true,
    }),
  );

  await manager.getRepository(User).save(
    manager.getRepository(User).create({
      tenantId: tenant.id,
      email: business.owner.email,
      fullName: business.owner.fullName,
      phone: business.owner.phone,
      passwordHash,
      role: UserRole.OWNER,
      active: true,
    }),
  );

  const services = await manager.getRepository(Service).save(
    business.services.map((service) =>
      manager.getRepository(Service).create({
        tenantId: tenant.id,
        name: service.name,
        durationMin: service.durationMin,
        priceClp: service.priceClp,
        active: true,
      }),
    ),
  );

  await manager.getRepository(AvailabilityRule).save(
    business.rules.map((rule) =>
      manager.getRepository(AvailabilityRule).create({
        tenantId: tenant.id,
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
        slotIntervalMin: rule.slotIntervalMin,
      }),
    ),
  );

  await manager.getRepository(AvailabilityException).save(
    business.exceptions.map((exception) =>
      manager.getRepository(AvailabilityException).create({
        tenantId: tenant.id,
        date: exception.date,
        closed: exception.closed,
        startTime: exception.startTime,
        endTime: exception.endTime,
      }),
    ),
  );

  const planned = planReservations(business, random);
  const reservations = await manager.getRepository(Reservation).save(
    planned.map((item) =>
      manager.getRepository(Reservation).create({
        tenantId: tenant.id,
        serviceId: services[item.serviceIndex].id,
        clientId: clients[item.clientIndex].id,
        startsAt: item.startsAt.toJSDate(),
        endsAt: item.endsAt.toJSDate(),
        status: item.status,
        // Solo un PENDING tiene retención viva, y el seed no siembra ninguno:
        // vencerían a los diez minutos y la demo quedaría llena de basura.
        expiresAt: null,
        priceClp: business.services[item.serviceIndex].priceClp,
        attended: item.attended,
        cancelledReason: item.cancelledReason,
      }),
    ),
  );

  // Una reserva solo llega a CONFIRMED con un pago aprobado detrás (regla 3).
  // `raw_response` va en NULL porque estos pagos nunca pasaron por Webpay:
  // inventar la respuesta de Transbank sería sembrar un dato falso.
  const payments = reservations
    .filter((reservation) => reservation.status === ReservationStatus.CONFIRMED)
    .map((reservation) =>
      manager.getRepository(Payment).create({
        tenantId: tenant.id,
        reservationId: reservation.id,
        buyOrder: buildBuyOrder(reservation.id, 1),
        tokenWs: null,
        amountClp: reservation.priceClp,
        status: PaymentStatus.APPROVED,
        attempt: 1,
        rawResponse: null,
      }),
    );

  await manager.getRepository(Payment).save(payments);

  return reservations.length;
}

export async function seedDemoData(source: DataSource): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const random = createRandom(RANDOM_SEED);

  await source.transaction(async (manager) => {
    const clients = await upsertClients(manager, passwordHash);

    for (const business of DEMO_BUSINESSES) {
      const total = await seedBusiness(manager, business, clients, passwordHash, random);
      console.log(`  ${business.name} (/${business.slug}) — ${total} reservas`);
    }
  });
}

async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    console.log('Sembrando datos de demostración');
    await seedDemoData(dataSource);
    console.log(`Listo. Contraseña de todas las cuentas: ${DEMO_PASSWORD}`);
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
