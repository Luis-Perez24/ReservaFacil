import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { Repository } from 'typeorm';

import { isUniqueViolation } from '../../infra/db/unique-violation';
import { Tenant } from './entities/tenant.entity';

export interface CreateTenantData {
  name: string;
  slug: string;
  timezone?: string;
}

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
  ) {}

  async findById(id: string): Promise<Tenant | null> {
    return this.tenants.findOne({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.tenants.findOne({ where: { slug } });
  }

  /**
   * Recibe el `EntityManager` en vez de abrir su propia transacción: el registro
   * de un negocio crea tenant y OWNER, y un negocio sin dueño no debe existir.
   * Quien orquesta la transacción es el llamador.
   */
  async createWithinTransaction(manager: EntityManager, data: CreateTenantData): Promise<Tenant> {
    const tenant = manager.create(Tenant, {
      name: data.name,
      slug: data.slug,
      ...(data.timezone ? { timezone: data.timezone } : {}),
    });

    try {
      return await manager.save(tenant);
    } catch (error) {
      if (isUniqueViolation(error, 'uq_tenants_slug')) {
        throw new ConflictException(`El slug "${data.slug}" ya está tomado`);
      }
      throw error;
    }
  }
}
