import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { AvailabilityExceptionResponse, AvailabilityRuleResponse } from '@reservafacil/contracts';

import { AvailabilityApi } from '../../core/api/availability.api';

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

  readonly exceptionForm = this.fb.nonNullable.group({
    date: [''],
    closed: [true],
    startTime: ['09:00'],
    endTime: ['18:00'],
  });

  constructor() {
    this.reloadRules();
    this.reloadExceptions();
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
        },
        error: (error: HttpErrorResponse) => {
          this.ruleSubmitting.set(false);
          this.ruleFormError.set(extractErrorMessage(error, 'No pudimos crear la regla.'));
        },
      });
  }

  deleteRule(id: string): void {
    this.availabilityApi
      .deleteRule(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reloadRules(),
        error: () => this.rulesState.set({ status: 'error' }),
      });
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
          this.reloadExceptions();
        },
        error: (error: HttpErrorResponse) => {
          this.exceptionSubmitting.set(false);
          this.exceptionFormError.set(extractErrorMessage(error, 'No pudimos crear la excepción.'));
        },
      });
  }

  deleteException(id: string): void {
    this.availabilityApi
      .deleteException(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.reloadExceptions(),
        error: () => this.exceptionsState.set({ status: 'error' }),
      });
  }
}
