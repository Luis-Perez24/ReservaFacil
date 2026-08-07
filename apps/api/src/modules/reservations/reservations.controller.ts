import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ReservationResponse } from '@reservafacil/contracts';

import { CreateReservationDto } from './dto/create-reservation.dto';
import type { Reservation } from './entities/reservation.entity';
import { ReservationsService } from './reservations.service';

/** Compartido con `reservation-attendance.controller.ts`: misma forma de respuesta en dashboard y público. */
export function toResponse(reservation: Reservation): ReservationResponse {
  return {
    id: reservation.id,
    serviceId: reservation.serviceId,
    status: reservation.status,
    startsAt: reservation.startsAt.toISOString(),
    endsAt: reservation.endsAt.toISOString(),
    expiresAt: reservation.expiresAt ? reservation.expiresAt.toISOString() : null,
    priceClp: reservation.priceClp,
    attended: reservation.attended,
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

  /**
   * Para que el cliente vea en qué quedó su reserva al volver de Webpay. Devuelve
   * solo lo que ya conoce quien tiene el id —horario, estado y precio—, nunca los
   * datos de la persona: el id es un uuid, pero sigue siendo una URL sin sesión.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Estado de una reserva' })
  async findOne(
    @Param('slug') slug: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReservationResponse> {
    const reservation = await this.reservationsService.findPublic(slug, id);

    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada');
    }

    return toResponse(reservation);
  }
}
