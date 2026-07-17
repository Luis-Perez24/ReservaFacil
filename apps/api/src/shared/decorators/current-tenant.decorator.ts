import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';

import type { AuthenticatedRequest } from '../types/authenticated-principal';

/** Requiere TenantGuard en la ruta: es quien pone el tenant en el request. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.tenantId) {
      throw new ForbiddenException('El token no está asociado a un negocio');
    }

    return request.tenantId;
  },
);
