import { DestroyRef, Injectable, inject } from '@angular/core';
import { SLOT_TAKEN_EVENT, SlotTakenEvent } from '@reservafacil/contracts';
import { Observable } from 'rxjs';
import { Socket, io } from 'socket.io-client';

/**
 * Canal en vivo con la API. Solo escucha: acá no se reserva nada, únicamente se
 * avisa que alguien más tomó un horario para poder refrescar la agenda.
 *
 * La conexión es al mismo origen; en desarrollo el proxy la reenvía a la API
 * (`proxy.conf.json` con `ws: true`).
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly destroyRef = inject(DestroyRef);

  private socket: Socket | null = null;

  /**
   * Escucha los horarios que se van ocupando en un negocio. Se desconecta solo
   * cuando muere quien lo llamó, para no dejar sockets abiertos al navegar.
   */
  watchTenant(slug: string): Observable<SlotTakenEvent> {
    return new Observable<SlotTakenEvent>((subscriber) => {
      const socket = this.connect();

      const onSlotTaken = (event: SlotTakenEvent): void => subscriber.next(event);
      const onConnect = (): void => {
        socket.emit('watch-tenant', slug);
      };

      socket.on(SLOT_TAKEN_EVENT, onSlotTaken);
      socket.on('connect', onConnect);

      // Si ya estaba conectado, el evento 'connect' no vuelve a dispararse.
      if (socket.connected) {
        onConnect();
      }

      return () => {
        socket.off(SLOT_TAKEN_EVENT, onSlotTaken);
        socket.off('connect', onConnect);
      };
    });
  }

  private connect(): Socket {
    if (!this.socket) {
      this.socket = io({ transports: ['websocket', 'polling'] });
      this.destroyRef.onDestroy(() => this.socket?.disconnect());
    }

    return this.socket;
  }
}
