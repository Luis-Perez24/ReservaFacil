import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { ServiceResponse } from '@reservafacil/contracts';
import type { Observable } from 'rxjs';

import { ServicesApi } from '../../core/api/services.api';

type ServicesState =
  | { status: 'loading' }
  | { status: 'ready'; rows: ServiceResponse[] }
  | { status: 'error' };

const CLP = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

/** El mismo texto que devuelve Nest en `message`: string si es una regla de negocio, array si es class-validator. */
function extractErrorMessage(error: HttpErrorResponse, fallback: string): string {
  const message: unknown = error.error?.message;
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message) && message.length > 0) {
    return String(message[0]);
  }
  return fallback;
}

/**
 * `/dashboard/servicios`. El backend soporta paginación cero y sin filtros
 * (services.controller.ts) — la lista siempre trae todo, activos e inactivos.
 */
@Component({
  selector: 'app-services-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './services-page.component.html',
  styleUrl: './services-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesPageComponent {
  private readonly servicesApi = inject(ServicesApi);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<ServicesState>({ status: 'loading' });
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  /** `null` = alta nueva; con id = editando ese servicio. */
  readonly editingId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    durationMin: [30, [Validators.required, Validators.min(1), Validators.max(1440)]],
    priceClp: [0, [Validators.required, Validators.min(0)]],
  });

  readonly rows = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.rows : [];
  });

  constructor() {
    this.reload();
  }

  formatClp(priceClp: number): string {
    return CLP.format(priceClp);
  }

  reload(): void {
    this.state.set({ status: 'loading' });
    this.servicesApi
      .findAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.state.set({ status: 'ready', rows }),
        error: () => this.state.set({ status: 'error' }),
      });
  }

  startEdit(service: ServiceResponse): void {
    this.editingId.set(service.id);
    this.formError.set(null);
    this.form.setValue({
      name: service.name,
      durationMin: service.durationMin,
      priceClp: service.priceClp,
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({ name: '', durationMin: 30, priceClp: 0 });
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);
    const dto = this.form.getRawValue();
    const editingId = this.editingId();

    const request$ = editingId ? this.servicesApi.update(editingId, dto) : this.servicesApi.create(dto);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.submitting.set(false);
        this.cancelEdit();
        this.reload();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.formError.set(
          extractErrorMessage(
            error,
            editingId ? 'No pudimos guardar los cambios.' : 'No pudimos crear el servicio.',
          ),
        );
      },
    });
  }

  toggleActive(service: ServiceResponse): void {
    const request$: Observable<unknown> = service.active
      ? this.servicesApi.deactivate(service.id)
      : this.servicesApi.update(service.id, { active: true });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.reload(),
      error: () => this.state.set({ status: 'error' }),
    });
  }
}
