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
import type { AvailabilityExceptionResponse, AvailabilityRuleResponse } from '@reservafacil/contracts';

import { AvailabilityApi } from '../../core/api/availability.api';
import { ToastService } from '../../core/toast/toast.service';

/** Lo que hay que confirmar antes de borrar: una regla semanal o una excepción puntual. */
type DeleteTarget =
  | { kind: 'rule'; id: string; label: string }
  | { kind: 'exception'; id: string; label: string };

type RulesState =
  | { status: 'loading' }
  | { status: 'ready'; rows: AvailabilityRuleResponse[] }
  | { status: 'error' };

type ExceptionsState =
  | { status: 'loading' }
  | { status: 'ready'; rows: AvailabilityExceptionResponse[] }
  | { status: 'error' };

/** 0=domingo … 6=sábado, igual que en la BD (contracts/catalog.ts). */
export const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

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

function byDayThenStart(a: AvailabilityRuleResponse, b: AvailabilityRuleResponse): number {
  return a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime);
}

function byDate(a: AvailabilityExceptionResponse, b: AvailabilityExceptionResponse): number {
  return a.date.localeCompare(b.date);
}

/**
 * `/dashboard/horarios`. No hay PATCH para reglas/excepciones (solo
 * crear/listar/borrar, availability.controller.ts) — "editar" es borrar y
 * volver a crear, así que no se ofrece un modo edición como en servicios.
 */
@Component({
  selector: 'app-availability-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './availability-page.component.html',
  styleUrl: './availability-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvailabilityPageComponent {
  private readonly availabilityApi = inject(AvailabilityApi);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);

  readonly dayLabels = DAY_LABELS;

  // ── Reglas semanales ─────────────────────────────────────────────────
  readonly rulesState = signal<RulesState>({ status: 'loading' });
  readonly rules = computed(() => {
    const state = this.rulesState();
    return state.status === 'ready' ? [...state.rows].sort(byDayThenStart) : [];
  });

  readonly ruleSubmitting = signal(false);
  readonly ruleFormError = signal<string | null>(null);

  readonly ruleForm = this.fb.nonNullable.group({
    dayOfWeek: [1, [Validators.required]],
    startTime: ['09:00', [Validators.required]],
    endTime: ['18:00', [Validators.required]],
    slotIntervalMin: [30, [Validators.required, Validators.min(5), Validators.max(480)]],
  });

  // ── Excepciones (feriados/cierres) ──────────────────────────────────
  readonly exceptionsState = signal<ExceptionsState>({ status: 'loading' });
  readonly exceptions = computed(() => {
    const state = this.exceptionsState();
    return state.status === 'ready' ? [...state.rows].sort(byDate) : [];
  });

  readonly exceptionSubmitting = signal(false);
  readonly exceptionFormError = signal<string | null>(null);

  /**
   * `startTime`/`endTime` empiezan deshabilitados porque `closed` empieza en
   * `true`. Deshabilitar en vez de sacarlos del template con `@if` mantiene
   * fijo el número de celdas del grid — así tildar el checkbox no reordena
   * el resto de los campos (antes, el grid recalculaba columnas y todo se
   * corría).
   */
  readonly exceptionForm = this.fb.nonNullable.group({
    date: [''],
    closed: [true],
    startTime: [{ value: '09:00', disabled: true }],
    endTime: [{ value: '18:00', disabled: true }],
  });

  // ── Borrar (con confirmación) ───────────────────────────────────────
  readonly deleteTarget = signal<DeleteTarget | null>(null);
  readonly deleting = signal(false);

  @ViewChild('confirmDialog', { static: true })
  private readonly confirmDialogRef!: ElementRef<HTMLDialogElement>;

  constructor() {
    this.reloadRules();
    this.reloadExceptions();

    this.exceptionForm.controls.closed.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((closed) => {
      const method = closed ? 'disable' : 'enable';
      this.exceptionForm.controls.startTime[method]({ emitEvent: false });
      this.exceptionForm.controls.endTime[method]({ emitEvent: false });
    });
  }

  dayLabel(dayOfWeek: number): string {
    return this.dayLabels[dayOfWeek] ?? `Día ${dayOfWeek}`;
  }

  reloadRules(): void {
    this.rulesState.set({ status: 'loading' });
    this.availabilityApi
      .findRules()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.rulesState.set({ status: 'ready', rows }),
        error: () => this.rulesState.set({ status: 'error' }),
      });
  }

  submitRule(): void {
    if (this.ruleForm.invalid || this.ruleSubmitting()) {
      this.ruleForm.markAllAsTouched();
      return;
    }

    this.ruleSubmitting.set(true);
    this.ruleFormError.set(null);

    this.availabilityApi
      .createRule(this.ruleForm.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.ruleSubmitting.set(false);
          this.reloadRules();
          this.toast.show('Horario agregado correctamente.');
        },
        error: (error: HttpErrorResponse) => {
          this.ruleSubmitting.set(false);
          this.ruleFormError.set(extractErrorMessage(error, 'No pudimos crear la regla.'));
        },
      });
  }

  requestDeleteRule(rule: AvailabilityRuleResponse): void {
    this.deleteTarget.set({
      kind: 'rule',
      id: rule.id,
      label: `${this.dayLabel(rule.dayOfWeek)} ${rule.startTime}–${rule.endTime}`,
    });
    this.confirmDialogRef.nativeElement.showModal();
  }

  reloadExceptions(): void {
    this.exceptionsState.set({ status: 'loading' });
    this.availabilityApi
      .findExceptions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.exceptionsState.set({ status: 'ready', rows }),
        error: () => this.exceptionsState.set({ status: 'error' }),
      });
  }

  submitException(): void {
    const { date, closed, startTime, endTime } = this.exceptionForm.getRawValue();

    if (!date || this.exceptionSubmitting()) {
      this.exceptionForm.markAllAsTouched();
      return;
    }

    this.exceptionSubmitting.set(true);
    this.exceptionFormError.set(null);

    this.availabilityApi
      .createException(closed ? { date, closed } : { date, closed, startTime, endTime })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.exceptionSubmitting.set(false);
          this.exceptionForm.reset({ date: '', closed: true, startTime: '09:00', endTime: '18:00' });
          // `reset()` no garantiza re-disparar la suscripción de arriba si el valor de
          // `closed` no cambia; se deja explícito para no depender de esa suposición.
          this.exceptionForm.controls.startTime.disable({ emitEvent: false });
          this.exceptionForm.controls.endTime.disable({ emitEvent: false });
          this.reloadExceptions();
          this.toast.show('Excepción agregada correctamente.');
        },
        error: (error: HttpErrorResponse) => {
          this.exceptionSubmitting.set(false);
          this.exceptionFormError.set(extractErrorMessage(error, 'No pudimos crear la excepción.'));
        },
      });
  }

  requestDeleteException(exception: AvailabilityExceptionResponse): void {
    this.deleteTarget.set({ kind: 'exception', id: exception.id, label: exception.date });
    this.confirmDialogRef.nativeElement.showModal();
  }

  /** También es el handler del evento `(close)` nativo del `<dialog>` (Esc, click afuera). */
  cancelDelete(): void {
    this.confirmDialogRef.nativeElement.close();
    this.deleteTarget.set(null);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target || this.deleting()) {
      return;
    }

    this.deleting.set(true);
    const request$ =
      target.kind === 'rule' ? this.availabilityApi.deleteRule(target.id) : this.availabilityApi.deleteException(target.id);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.deleting.set(false);
        this.cancelDelete();
        if (target.kind === 'rule') {
          this.reloadRules();
        } else {
          this.reloadExceptions();
        }
        this.toast.show('Horario borrado con éxito.');
      },
      error: () => {
        this.deleting.set(false);
        this.cancelDelete();
        if (target.kind === 'rule') {
          this.rulesState.set({ status: 'error' });
        } else {
          this.exceptionsState.set({ status: 'error' });
        }
      },
    });
  }
}
