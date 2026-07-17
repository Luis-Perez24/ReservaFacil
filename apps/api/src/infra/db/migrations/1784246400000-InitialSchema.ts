import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema completo desde el inicio, con `tenant_id` en toda tabla de negocio.
 * La multi-tenancy no se agrega después: retrofittearla obliga a tocar cada
 * tabla, cada query y cada índice (docs/03-modelo-datos.md).
 *
 * SQL escrito a mano y no generado: el índice parcial `uq_reservation_active_slot`
 * es la red de seguridad de la invariante central del producto y no puede
 * depender de lo que el generador decida emitir.
 */
export class InitialSchema1784246400000 implements MigrationInterface {
  name = 'InitialSchema1784246400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid()
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`CREATE TYPE "user_role" AS ENUM ('OWNER', 'STAFF', 'CLIENT')`);
    await queryRunner.query(
      `CREATE TYPE "reservation_status" AS ENUM ('PENDING', 'PAID', 'CONFIRMED', 'EXPIRED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "payment_status" AS ENUM ('INITIATED', 'APPROVED', 'REJECTED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "reminder_channel" AS ENUM ('EMAIL', 'TELEGRAM', 'WHATSAPP')`,
    );
    await queryRunner.query(`CREATE TYPE "reminder_status" AS ENUM ('PENDING', 'SENT', 'FAILED')`);

    // El negocio. Raíz de todo el aislamiento.
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" text NOT NULL,
        "slug" text NOT NULL,
        "timezone" text NOT NULL DEFAULT 'America/Santiago',
        "branding" jsonb,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_tenants_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid,
        "email" text NOT NULL,
        "password_hash" text NOT NULL,
        "full_name" text NOT NULL,
        "phone" text,
        "role" "user_role" NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_users_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id")
      )
    `);

    // NULLS NOT DISTINCT (Postgres 15+): sin esto, los CLIENT —que van con
    // tenant_id NULL— podrían repetir email, porque para un índice único dos
    // NULL son distintos entre sí. El mismo email sí puede existir en dos
    // tenants: es el caso que el índice permite a propósito.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_tenant_email" ON "users" ("tenant_id", "email") NULLS NOT DISTINCT`,
    );

    await queryRunner.query(`
      CREATE TABLE "services" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "name" text NOT NULL,
        "duration_min" int NOT NULL,
        "price_clp" int NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_services_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id"),
        CONSTRAINT "ck_services_duration_positive" CHECK ("duration_min" > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "ix_services_tenant_active" ON "services" ("tenant_id", "active")`);

    await queryRunner.query(`
      CREATE TABLE "availability_rules" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "day_of_week" smallint NOT NULL,
        "start_time" time NOT NULL,
        "end_time" time NOT NULL,
        "slot_interval_min" int NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_availability_rules_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id"),
        CONSTRAINT "ck_availability_rules_time_order" CHECK ("end_time" > "start_time")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_availability_rules_tenant_day" ON "availability_rules" ("tenant_id", "day_of_week")`,
    );

    // Las excepciones ganan sobre la regla semanal.
    await queryRunner.query(`
      CREATE TABLE "availability_exceptions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "date" date NOT NULL,
        "closed" boolean NOT NULL,
        "start_time" time,
        "end_time" time,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_availability_exceptions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id"),
        CONSTRAINT "uq_availability_exceptions_tenant_date" UNIQUE ("tenant_id", "date")
      )
    `);

    // El núcleo. Acá vive la invariante que defiende todo el proyecto.
    await queryRunner.query(`
      CREATE TABLE "reservations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "service_id" uuid NOT NULL,
        "client_id" uuid NOT NULL,
        "starts_at" timestamptz NOT NULL,
        "ends_at" timestamptz NOT NULL,
        "status" "reservation_status" NOT NULL,
        "expires_at" timestamptz,
        "price_clp" int NOT NULL,
        "attended" boolean,
        "cancelled_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_reservations_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id"),
        CONSTRAINT "fk_reservations_service" FOREIGN KEY ("service_id") REFERENCES "services" ("id"),
        CONSTRAINT "fk_reservations_client" FOREIGN KEY ("client_id") REFERENCES "users" ("id")
      )
    `);

    // Calendario del negocio.
    await queryRunner.query(
      `CREATE INDEX "ix_reservations_tenant_starts_at" ON "reservations" ("tenant_id", "starts_at")`,
    );
    // Job de expiración.
    await queryRunner.query(
      `CREATE INDEX "ix_reservations_status_expires_at" ON "reservations" ("status", "expires_at")`,
    );

    // La red de seguridad de la invariante: nunca dos reservas activas en el
    // mismo slot. El lock pesimista es la lógica (adr/0002); esto es el seguro
    // por si la lógica falla. Cubre mismo starts_at: el solapamiento parcial
    // entre servicios de distinta duración lo cubre el FOR UPDATE por rango.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_reservation_active_slot"
        ON "reservations" ("tenant_id", "service_id", "starts_at")
        WHERE "status" IN ('PENDING', 'PAID', 'CONFIRMED')
    `);

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "reservation_id" uuid NOT NULL,
        "buy_order" text NOT NULL,
        "token_ws" text,
        "amount_clp" int NOT NULL,
        "status" "payment_status" NOT NULL,
        "attempt" int NOT NULL,
        "raw_response" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_payments_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id"),
        CONSTRAINT "fk_payments_reservation" FOREIGN KEY ("reservation_id") REFERENCES "reservations" ("id"),
        CONSTRAINT "uq_payments_buy_order" UNIQUE ("buy_order")
      )
    `);
    await queryRunner.query(`CREATE INDEX "ix_payments_reservation" ON "payments" ("reservation_id")`);

    await queryRunner.query(`
      CREATE TABLE "reminders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "reservation_id" uuid NOT NULL,
        "channel" "reminder_channel" NOT NULL,
        "status" "reminder_status" NOT NULL,
        "scheduled_for" timestamptz NOT NULL,
        "sent_at" timestamptz,
        "attempts" int NOT NULL DEFAULT 0,
        "last_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_reminders_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id"),
        CONSTRAINT "fk_reminders_reservation" FOREIGN KEY ("reservation_id") REFERENCES "reservations" ("id"),
        CONSTRAINT "uq_reminders_reservation_channel" UNIQUE ("reservation_id", "channel")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_reminders_status_scheduled_for" ON "reminders" ("status", "scheduled_for")`,
    );

    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "key" text PRIMARY KEY,
        "tenant_id" uuid NOT NULL,
        "endpoint" text NOT NULL,
        "request_hash" text NOT NULL,
        "response_status" int,
        "response_body" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_idempotency_keys_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
    await queryRunner.query(`DROP TABLE "reminders"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TABLE "reservations"`);
    await queryRunner.query(`DROP TABLE "availability_exceptions"`);
    await queryRunner.query(`DROP TABLE "availability_rules"`);
    await queryRunner.query(`DROP TABLE "services"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "tenants"`);

    await queryRunner.query(`DROP TYPE "reminder_status"`);
    await queryRunner.query(`DROP TYPE "reminder_channel"`);
    await queryRunner.query(`DROP TYPE "payment_status"`);
    await queryRunner.query(`DROP TYPE "reservation_status"`);
    await queryRunner.query(`DROP TYPE "user_role"`);
  }
}
