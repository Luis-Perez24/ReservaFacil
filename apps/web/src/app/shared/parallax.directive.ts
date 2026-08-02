import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Desplaza el elemento más lento que el scroll, dando sensación de profundidad
 * (la foto del hero "queda atrás" mientras el contenido sube). Solo `transform`,
 * en `requestAnimationFrame` y fuera de Angular: no dispara detección de cambios
 * ni toca layout. Se desactiva si la persona pidió menos movimiento.
 *
 * El elemento debe tener margen de sobra (más alto que su marco) para que el
 * desplazamiento no descubra un borde.
 */
@Directive({
  selector: '[appParallax]',
  standalone: true,
})
export class ParallaxDirective implements OnInit, OnDestroy {
  /** Cuánto se rezaga respecto al scroll (0 = fijo, 1 = a la par). */
  readonly factor = input(0.12, { alias: 'appParallax' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private ticking = false;

  ngOnInit(): void {
    if (this.prefersReducedMotion()) {
      return;
    }

    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.onScroll, { passive: true });
      this.apply();
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onScroll);
  }

  private readonly onScroll = (): void => {
    if (this.ticking) {
      return;
    }

    this.ticking = true;
    requestAnimationFrame(() => {
      this.apply();
      this.ticking = false;
    });
  };

  private apply(): void {
    const offset = window.scrollY * this.factor();
    this.host.nativeElement.style.transform = `translate3d(0, ${offset}px, 0)`;
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
