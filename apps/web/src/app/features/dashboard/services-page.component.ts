import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { ServiceResponse } from '@reservafacil/contracts';

import { ServicesApi } from '../../core/api/services.api';
import { ToastService } from '../../core/toast/toast.service';

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
  private readonly toast = inject(ToastService);

  readonly state = signal<ServicesState>({ status: 'loading' });
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  /** `null` = alta nueva; con id = editando ese servicio (el modal está abierto). */
  readonly editingId = signal<string | null>(null);
  /** Servicio pendiente de confirmar desactivación; `null` = el modal de confirmación está cerrado. */
  readonly deactivateTarget = signal<ServiceResponse | null>(null);
  readonly deactivating = signal(false);

  @ViewChild('editDialog', { static: true })
  private readonly editDialogRef!: ElementRef<HTMLDialogElement>;

  @ViewChild('confirmDialog', { static: true })
  private readonly confirmDialogRef!: ElementRef<HTMLDialogElement>;

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
    this.editDialogRef.nativeElement.showModal();
  }

  /** También es el handler del evento `(close)` nativo del `<dialog>` (Esc, click afuera). */
  cancelEdit(): void {
    this.editDialogRef.nativeElement.close();
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
        this.toast.show(editingId ? 'Servicio actualizado correctamente.' : 'Servicio creado correctamente.');
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

  /** Reactivar no es destructivo: no necesita confirmación, va directo. */
  reactivate(service: ServiceResponse): void {
    this.servicesApi
      .update(service.id, { active: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.reload();
          this.toast.show('Servicio reactivado.');
        },
        error: () => this.state.set({ status: 'error' }),
      });
  }

  requestDeactivate(service: ServiceResponse): void {
    this.deactivateTarget.set(service);
    this.confirmDialogRef.nativeElement.showModal();
  }

  /** También es el handler del evento `(close)` nativo del `<dialog>` (Esc, click afuera). */
  cancelDeactivate(): void {
    this.confirmDialogRef.nativeElement.close();
    this.deactivateTarget.set(null);
  }

  confirmDeactivate(): void {
    const service = this.deactivateTarget();
    if (!service || this.deactivating()) {
      return;
    }

    this.deactivating.set(true);
    this.servicesApi
      .deactivate(service.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deactivating.set(false);
          this.cancelDeactivate();
          this.reload();
          this.toast.show('Servicio desactivado.');
        },
        error: () => {
          this.deactivating.set(false);
          this.cancelDeactivate();
          this.state.set({ status: 'error' });
        },
      });
  }
}
