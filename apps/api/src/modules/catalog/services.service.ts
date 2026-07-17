import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CreateServiceDto } from './dto/create-service.dto';
import type { UpdateServiceDto } from './dto/update-service.dto';
import { Service } from './entities/service.entity';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
  ) {}

  async create(tenantId: string, dto: CreateServiceDto): Promise<Service> {
    return this.services.save(this.services.create({ ...dto, tenantId }));
  }

  async findAll(tenantId: string): Promise<Service[]> {
    return this.services.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async findOne(tenantId: string, id: string): Promise<Service> {
    const service = await this.services.findOne({ where: { id, tenantId } });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    return service;
  }

  /** Para la página pública y el cálculo de slots: solo servicios activos. */
  async findActiveOne(tenantId: string, id: string): Promise<Service | null> {
    return this.services.findOne({ where: { id, tenantId, active: true } });
  }

  async findAllActive(tenantId: string): Promise<Service[]> {
    return this.services.find({ where: { tenantId, active: true }, order: { name: 'ASC' } });
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto): Promise<Service> {
    const service = await this.findOne(tenantId, id);

    return this.services.save(this.services.merge(service, dto));
  }

  /**
   * Soft delete: las reservas apuntan al servicio por FK y el historial de un
   * servicio borrado seguiría siendo real. Desactivar lo saca de la página
   * pública sin romper nada; PATCH { active: true } lo revive.
   */
  async deactivate(tenantId: string, id: string): Promise<void> {
    const service = await this.findOne(tenantId, id);

    service.active = false;
    await this.services.save(service);
  }
}
