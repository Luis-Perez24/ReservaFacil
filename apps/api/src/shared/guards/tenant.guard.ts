import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import type { AuthenticatedRequest } from '../types/authenticated-principal';

/**
 * Inyecta el tenant del JWT en el request. Todo lo que venga después filtra
 * por `request.tenantId`, nunca por un id que llegue del cliente: si el tenant
 * fuera un parámetro, cambiarlo sería ver los datos de otro negocio.
 *
 * La otra vía —el slug de la página pública— entra el Día 2, cuando exista un
 * endpoint público que la necesite.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('El token no está asociado a un negocio');
    }

    request.tenantId = tenantId;

    return true;
  }
}
