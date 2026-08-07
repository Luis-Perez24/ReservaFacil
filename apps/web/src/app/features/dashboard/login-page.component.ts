import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

/**
 * Login del dashboard, en `/dashboard/login`. Sin sesión previa, es la única
 * puerta al resto de `/dashboard` (protegido por `authGuard`).
 */
@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly submitting = signal(false);
  readonly loginError = signal<string | null>(null);
  readonly showPassword = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.loginError.set(null);

    this.auth
      .login(this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          void this.router.navigateByUrl('/dashboard');
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          this.loginError.set(
            error.status === 401
              ? 'Email o contraseña incorrectos.'
              : 'No pudimos iniciar sesión. Vuelve a intentar.',
          );
        },
      });
  }

  toggleShowPassword(): void {
    this.showPassword.update((value) => !value);
  }

  /**
   * Brillo que sigue al cursor en el panel de marca. Se escribe directo en
   * el DOM (sin signal) a propósito: mousemove dispara muchas veces por
   * segundo, y pasar eso por change detection sería trabajo de sobra para
   * algo que no es estado de la app, es solo feedback visual.
   */
  onBrandMouseMove(event: MouseEvent, panel: HTMLElement): void {
    const rect = panel.getBoundingClientRect();
    panel.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
    panel.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
  }
}
