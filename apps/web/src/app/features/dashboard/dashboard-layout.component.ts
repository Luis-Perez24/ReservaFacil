import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { TenantApi } from '../../core/api/tenant.api';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';
import { ToastComponent } from '../../core/toast/toast.component';

/**
 * Cabecera fija de `/dashboard` (nombre del negocio + salir) con el resto de
 * las páginas del panel en el `router-outlet`. Separado de la página de
 * métricas para que el header no se reconstruya si el día 11/12 suman más
 * páginas al dashboard (chat de IA, etc.).
 */
@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule, ToastComponent],
  templateUrl: './dashboard-layout.component.html',
  styleUrl: './dashboard-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardLayoutComponent {
  private readonly tenantApi = inject(TenantApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly theme = inject(ThemeService);

  readonly user = this.auth.user;
  readonly businessName = signal<string | null>(null);

  /** "Daniela Soto" → "DS". Sin foto de perfil en el modelo, así que el avatar es siempre iniciales. */
  readonly initials = computed(() => {
    const fullName = this.user()?.fullName;
    if (!fullName) {
      return '?';
    }
    return fullName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('');
  });

  constructor() {
    this.tenantApi
      .findMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tenant) => this.businessName.set(tenant.name),
        // Sin datos del negocio el header igual sirve: solo se ve el título genérico.
        error: (_error: HttpErrorResponse) => this.businessName.set(null),
      });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/dashboard/login');
  }
}
