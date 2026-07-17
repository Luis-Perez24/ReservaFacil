import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { JwtPayload } from '@reservafacil/contracts';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { EnvironmentVariables } from '../../infra/config/env.validation';
import type { AuthenticatedPrincipal } from '../../shared/types/authenticated-principal';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  /**
   * Passport ya verificó firma y expiración. No se consulta la BD acá: el
   * payload basta para autorizar y hacerlo mantiene el guard sin queries.
   * El costo es conocido: desactivar un usuario recién surte efecto cuando
   * su access token expira.
   */
  validate(payload: JwtPayload): AuthenticatedPrincipal {
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    };
  }
}
