import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { ChatMessage } from '@reservafacil/contracts';
import { catchError, of } from 'rxjs';

import { ChatApi } from '../../core/api/chat.api';

/** Mismo texto que devuelve el backend degradado (adr/0004) — si la red falla antes de llegar, no hay otro que inventar. */
const FALLBACK_REPLY =
  'No pudimos conectar con el asistente ahora mismo. Puedes buscar disponibilidad manualmente.';

const SALUDO_INICIAL: ChatMessage = {
  role: 'model',
  text: '¡Hola! Cuéntame qué servicio y cuándo te gustaría reservar, y te digo qué horarios hay libres.',
};

/**
 * Widget flotante en la página pública del negocio. Solo texto: la IA
 * redacta, nunca inventa un horario (adr/0004) — los datos siempre vienen
 * de `POST /public/:slug/chat`, que ya ejecuta las funciones reales contra
 * el catálogo. Si el backend degrada (`ChatResponse.degraded`) o el HTTP
 * mismo falla, se ofrece el link al buscador manual sin bloquear el chat.
 */
@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './chat-widget.component.html',
  styleUrl: './chat-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWidgetComponent {
  readonly slug = input.required<string>();

  private readonly chatApi = inject(ChatApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = signal(false);
  readonly messages = signal<ChatMessage[]>([SALUDO_INICIAL]);
  readonly draft = signal('');
  readonly sending = signal(false);
  readonly degraded = signal(false);

  toggle(): void {
    this.open.update((value) => !value);
  }

  send(): void {
    const text = this.draft().trim();

    if (!text || this.sending()) {
      return;
    }

    const historial = this.messages();
    this.messages.update((turnos) => [...turnos, { role: 'user', text }]);
    this.draft.set('');
    this.sending.set(true);

    this.chatApi
      .send(this.slug(), text, historial)
      .pipe(
        catchError(() =>
          of({
            reply: FALLBACK_REPLY,
            history: [...this.messages(), { role: 'model', text: FALLBACK_REPLY } as ChatMessage],
            degraded: true,
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((respuesta) => {
        this.messages.set(respuesta.history);
        this.degraded.set(!!respuesta.degraded);
        this.sending.set(false);
      });
  }
}
