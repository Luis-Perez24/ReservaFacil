import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';

import { TenantApi } from '../../core/api/tenant.api';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Cabecera fija de `/dashboard` (nombre del negocio + salir) con el resto de
 * las páginas del panel en el `router-outlet`. Separado de la página de
 * métricas para que el header no se reconstruya si el día 11/12 suman más
 * páginas al dashboard (chat de IA, etc.).
 */
@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './dashboard-layout.component.html',
  styleUrl: './dashboard-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardLayoutComponent {
  private readonly tenantApi = inject(TenantApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = this.auth.user;
  readonly businessName = signal<string | null>(null);

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
