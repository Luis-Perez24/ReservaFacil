import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

import type { AuthenticatedPrincipal, AuthenticatedRequest } from '../types/authenticated-principal';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new UnauthorizedException();
    }

    return request.user;
  },
);
