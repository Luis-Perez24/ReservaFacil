import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * A dónde vuelve quien se arrepiente dentro de Webpay. No hay reserva que
 * mostrar —el retorno llega sin token y sin identificarla—, así que solo se
 * explica qué pasó y qué sigue.
 */
@Component({
  selector: 'app-payment-cancelled-page',
  standalone: true,
  template: `
    <div class="page">
      <section class="result">
        <h1 class="result__title">Cancelaste el pago</h1>
        <p class="result__text">
          Tu hora sigue reservada por unos minutos más. Si quieres confirmarla, vuelve a la página
          del negocio y paga antes de que venza la retención.
        </p>
      </section>
    </div>
  `,
  styles: `
    .page {
      max-width: 46rem;
      margin: 0 auto;
      padding: var(--space-16) var(--space-6);
    }

    .result {
      display: grid;
      gap: var(--space-4);
      justify-items: start;
    }

    .result__title {
      font-size: clamp(1.875rem, 6vw, 2.75rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.05;
    }

    .result__text {
      max-width: 46ch;
      color: var(--ink-soft);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentCancelledPageComponent {}
