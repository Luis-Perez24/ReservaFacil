import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  input,
} from '@angular/core';
import { Chart, ChartConfiguration } from 'chart.js/auto';

/**
 * Envoltorio delgado de Chart.js: la librería es imperativa (crea/actualiza un
 * objeto `Chart` sobre un `<canvas>`), así que no hay forma "puramente
 * declarativa" de usarla — este componente es el único lugar del dashboard
 * que la toca directo.
 */
@Component({
  selector: 'app-chart-canvas',
  standalone: true,
  template: '<canvas #canvas></canvas>',
  styleUrl: './chart-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartCanvasComponent implements AfterViewInit, OnDestroy {
  readonly config = input.required<ChartConfiguration>();

  @ViewChild('canvas', { static: true })
  private readonly canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const config = this.config();
      if (!this.chart) {
        return;
      }
      this.chart.data = config.data;
      this.chart.options = config.options ?? {};
      this.chart.update();
    });
  }

  ngAfterViewInit(): void {
    this.chart = new Chart(this.canvasRef.nativeElement, this.config());
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
