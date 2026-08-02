import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Revela el elemento cuando entra en pantalla: pasa de un leve desplazamiento y
 * opacidad 0 a su lugar. El movimiento lo pinta el CSS (clase `.reveal`); acá
 * solo se decide *cuándo* con un IntersectionObserver, que es barato y nativo.
 *
 * `[appReveal]` acepta un retardo en ms para cascadas (`[appReveal]="i * 70"`),
 * y si la persona pidió menos movimiento, el elemento aparece sin animar.
 */
@Directive({
  selector: '[appReveal]',
  standalone: true,
  host: { class: 'reveal' },
})
export class RevealOnScrollDirective implements OnInit, OnDestroy {
  /** Retardo del reveal, en ms, para escalonar varios elementos. */
  readonly delay = input(0, { alias: 'appReveal' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    const el = this.host.nativeElement;

    if (this.prefersReducedMotion()) {
      el.classList.add('is-visible');
      return;
    }

    el.style.transitionDelay = `${this.delay()}ms`;

    // Fuera de Angular: el observer no necesita disparar detección de cambios,
    // solo alterna una clase.
    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              this.observer?.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
      );

      this.observer.observe(el);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
