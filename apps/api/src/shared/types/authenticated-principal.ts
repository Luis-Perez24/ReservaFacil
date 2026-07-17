import type { UserRole } from '@reservafacil/contracts';
import type { Request } from 'express';

/**
 * Lo que el JWT deja en el request. No es la entidad User: son los claims
 * verificados del token, sin PII y sin tocar la BD.
 */
export interface AuthenticatedPrincipal {
  userId: string;
  tenantId: string | null;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedPrincipal;
  /** Lo inyecta el TenantGuard. Toda query de negocio se filtra por acá. */
  tenantId?: string;
}
