import type { UserRole } from './roles';

export interface RegisterBusinessRequest {
  businessName: string;
  slug: string;
  timezone?: string;
  ownerFullName: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  tenantId: string | null;
}

export interface RegisterBusinessResponse {
  tenant: { id: string; name: string; slug: string; timezone: string };
  user: AuthenticatedUser;
  tokens: AuthTokens;
}

export interface LoginResponse {
  user: AuthenticatedUser;
  tokens: AuthTokens;
}

/** Claims del access token. `sub` es el id del usuario. Sin PII a propósito. */
export interface JwtPayload {
  sub: string;
  tenantId: string | null;
  role: UserRole;
}
