import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ReservationResponse } from '@reservafacil/contracts';

import { CreateReservationDto } from './dto/create-reservation.dto';
import type { Reservation } from './entities/reservation.entity';
import { ReservationsService } from './reservations.service';

function toResponse(reservation: Reservation): ReservationResponse {
  return {
    id: reservation.id,
    serviceId: reservation.serviceId,
    status: reservation.status,
    startsAt: reservation.startsAt.toISOString(),
    endsAt: reservation.endsAt.toISOString(),
    expiresAt: reservation.expiresAt ? reservation.expiresAt.toISOString() : null,
    priceClp: reservation.priceClp,
  };
}

/**
 * Crear una reserva es una acción del cliente en la página pública del negocio,
 * así que el endpoint es público y el tenant sale del `slug` de la URL —igual
 * que el resto de `/public/:slug/*`. Sin auth: el cliente aún no tiene sesión.
 */
@ApiTags('reservations')
@Controller('public/:slug/reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una reserva (retención de 10 min)' })
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateReservationDto,
  ): Promise<ReservationResponse> {
    return toResponse(await this.reservationsService.create(slug, dto));
  }
}
