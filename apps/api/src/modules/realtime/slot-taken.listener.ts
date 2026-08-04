import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  RESERVATION_SLOT_TAKEN_EVENT,
  ReservationSlotTakenEvent,
} from '../reservations/reservations.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * La costura entre el núcleo y el canal en vivo. `reservations` anuncia que un
 * slot se ocupó y este listener lo traduce a un mensaje de Socket.IO.
 *
 * La dependencia va en esta dirección a propósito —`realtime → reservations`,
 * nunca al revés—: quien reacciona conoce a quien emite, igual que
 * `notifications` con el recordatorio (`adr/0001`). Así el núcleo puede seguir
 * sumando consumidores sin enterarse de ninguno.
 */
@Injectable()
export class SlotTakenListener {
  constructor(private readonly gateway: RealtimeGateway) {}

  @OnEvent(RESERVATION_SLOT_TAKEN_EVENT)
  handleSlotTaken(event: ReservationSlotTakenEvent): void {
    this.gateway.emitSlotTaken(event.slug, {
      serviceId: event.serviceId,
      startsAt: event.startsAt,
    });
  }
}
