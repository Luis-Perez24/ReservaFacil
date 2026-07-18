import { Injectable, NotImplementedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import type { CreateReservationDto } from './dto/create-reservation.dto';
import { Reservation } from './entities/reservation.entity';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservations: Repository<Reservation>,
    // El lock corre dentro de una transacción manejada por el DataSource
    // (mismo patrón que auth). Se usa en la mitad B.
    private readonly dataSource: DataSource,
  ) {}

  /**
   * El corazón del proyecto. Se implementa en la MITAD B (día 3, fresco):
   * transacción + `SELECT … FOR UPDATE` sobre el rango del slot, tratando un
   * `PENDING` expirado como libre, e insertando en estado `PENDING` con
   * `expires_at = now() + 10 min`. Ver `adr/0002`.
   *
   * Hoy solo existe la firma para dejar el módulo cableado y la ruta en Swagger.
   */
  create(_slug: string, _dto: CreateReservationDto): Promise<Reservation> {
    throw new NotImplementedException(
      'El locking de reservas se implementa en la mitad B del día 3',
    );
  }

  async findById(tenantId: string, id: string): Promise<Reservation | null> {
    return this.reservations.findOne({ where: { id, tenantId } });
  }
}
