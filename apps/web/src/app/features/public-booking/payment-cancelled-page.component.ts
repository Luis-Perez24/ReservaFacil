import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * A dónde vuelve quien se arrepiente dentro de Webpay. No hay reserva que
 * mostrar —el retorno llega sin token y sin identificarla—, así que solo se
 * explica qué pasó y qué sigue. Sin color de marca: acá no se sabe el negocio.
 */
@Component({
  selector: 'app-payment-cancelled-page',
  standalone: true,
  template: `
    <div class="cancel-page">
      <section class="cancel">
        <div class="cancel__badge">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </div>
        <p class="cancel__eyebrow">Pago cancelado</p>
        <h1 class="cancel__title">Cancelaste el pago</h1>
        <p class="cancel__text">
          Tu hora sigue reservada por unos minutos más. Si quieres confirmarla, vuelve a la página
          del negocio y paga antes de que venza la retención.
        </p>
      </section>
    </div>
  `,
  styles: `
    .cancel-page {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: var(--space-16) var(--space-6);
    }

    .cancel {
      width: 100%;
      max-width: 32rem;
      display: grid;
      justify-items: center;
      text-align: center;
      gap: var(--space-4);
    }

    .cancel__badge {
      display: grid;
      place-items: center;
      width: 4.5rem;
      height: 4.5rem;
      margin-bottom: var(--space-4);
      border-radius: 50%;
      background: var(--mist);
      color: var(--ink-soft);
    }

    .cancel__badge svg {
      width: 2rem;
      height: 2rem;
    }

    .cancel__eyebrow {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--ink-soft);
    }

    .cancel__title {
      font-family: var(--font-display);
      font-size: clamp(1.875rem, 5vw, 2.75rem);
      font-weight: 750;
      letter-spacing: -0.02em;
      line-height: 1.05;
      text-wrap: balance;
    }

    .cancel__text {
      max-width: 44ch;
      color: var(--ink-soft);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentCancelledPageComponent {}
