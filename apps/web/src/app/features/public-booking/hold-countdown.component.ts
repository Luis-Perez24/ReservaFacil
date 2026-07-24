import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * Lo que queda de la retención del slot. El servidor es el dueño del plazo
 * —`expires_at` sale de su reloj—; esto solo lo muestra y avisa cuando llegó a
 * cero, para que la pantalla no siga ofreciendo pagar algo que ya venció.
 */
@Component({
  selector: 'app-hold-countdown',
  standalone: true,
  template: `
    <span class="countdown" [class.countdown--urgent]="urgent()" role="timer">
      {{ label() }}
    </span>
  `,
  styles: `
    .countdown {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 1.125rem;
      font-weight: 600;
    }

    .countdown--urgent {
      color: #b91c1c;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HoldCountdownComponent {
  /** Instante ISO en que vence la retención. */
  readonly expiresAt = input.required<string>();

  readonly expired = output<void>();

  private readonly now = signal(Date.now());
  private avisado = false;

  readonly remainingMs = computed(() =>
    Math.max(0, new Date(this.expiresAt()).getTime() - this.now()),
  );

  /** Último minuto: se marca en rojo. */
  readonly urgent = computed(() => this.remainingMs() > 0 && this.remainingMs() < 60_000);

  readonly label = computed(() => {
    const totalSeconds = Math.ceil(this.remainingMs() / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    effect(() => {
      if (this.remainingMs() === 0 && !this.avisado) {
        this.avisado = true;
        this.expired.emit();
      }
    });
  }
}
