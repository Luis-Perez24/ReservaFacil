import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AuthTokens,
  AuthenticatedUser,
  JwtPayload,
  LoginResponse,
  RegisterBusinessResponse,
  UserRole,
} from '@reservafacil/contracts';
import { DataSource, IsNull, Not, Repository } from 'typeorm';

import type { EnvironmentVariables } from '../../infra/config/env.validation';
import { isUniqueViolation } from '../../infra/db/unique-violation';
import { TenantsService } from '../tenants/tenants.service';
import type { LoginDto } from './dto/login.dto';
import type { RefreshDto } from './dto/refresh.dto';
import type { RegisterBusinessDto } from './dto/register-business.dto';
import { User } from './entities/user.entity';
import { PasswordService } from './password.service';

/** Solo el `sub`: el rol y el tenant se releen de la BD al refrescar. */
interface RefreshPayload {
  sub: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * Crea el negocio y su dueño en una sola transacción: un negocio sin OWNER
   * no tendría cómo administrarse, y un OWNER sin negocio no podría entrar.
   * O quedan los dos, o no queda ninguno.
   */
  async registerBusiness(dto: RegisterBusinessDto): Promise<RegisterBusinessResponse> {
    const { tenant, user } = await this.dataSource.transaction(async (manager) => {
      const tenant = await this.tenantsService.createWithinTransaction(manager, {
        name: dto.businessName,
        slug: dto.slug,
        timezone: dto.timezone,
      });

      const user = manager.create(User, {
        tenantId: tenant.id,
        email: dto.email,
        passwordHash: await this.passwordService.hash(dto.password),
        fullName: dto.ownerFullName,
        role: UserRole.OWNER,
      });

      try {
        return { tenant, user: await manager.save(user) };
      } catch (error) {
        if (isUniqueViolation(error, 'uq_users_tenant_email')) {
          throw new ConflictException('Ese email ya está registrado en este negocio');
        }
        throw error;
      }
    });

    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, timezone: tenant.timezone },
      user: this.toAuthenticatedUser(user),
      tokens: this.issueTokens(user),
    };
  }

  /**
   * Login del dashboard: busca solo entre usuarios con negocio (OWNER/STAFF).
   * El mismo email puede existir en varios tenants —y como CLIENT sin tenant—,
   * así que el email por sí solo no identifica a nadie. El login de clientes
   * es otro flujo.
   */
  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.findDashboardUser(dto);

    // Mismo error para email inexistente y password incorrecta: distinguirlos
    // convierte el login en un detector de qué emails están registrados.
    if (!user || !(await this.passwordService.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.active) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return {
      user: this.toAuthenticatedUser(user),
      tokens: this.issueTokens(user),
    };
  }

  /**
   * El rol y el tenant se releen de la BD en vez de copiarlos del refresh: si
   * el usuario cambió de rol o fue desactivado, el access token nuevo lo
   * refleja.
   */
  async refresh(dto: RefreshDto): Promise<AuthTokens> {
    let payload: RefreshPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(dto.refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o vencido');
    }

    const user = await this.users.findOne({ where: { id: payload.sub } });

    if (!user || !user.active) {
      throw new UnauthorizedException('Refresh token inválido o vencido');
    }

    return this.issueTokens(user);
  }

  async findAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.users.findOne({ where: { id: userId } });

    if (!user || !user.active) {
      throw new UnauthorizedException();
    }

    return this.toAuthenticatedUser(user);
  }

  private async findDashboardUser(dto: LoginDto): Promise<User | null> {
    if (dto.slug) {
      const tenant = await this.tenantsService.findBySlug(dto.slug);

      // Un slug inexistente responde igual que una credencial mala: decir
      // "ese negocio no existe" ya es información que no le debemos a nadie.
      if (!tenant) {
        return null;
      }

      return this.users.findOne({ where: { tenantId: tenant.id, email: dto.email } });
    }

    const candidates = await this.users.find({
      where: { email: dto.email, tenantId: Not(IsNull()) },
    });

    if (candidates.length > 1) {
      throw new ConflictException(
        'Ese email está registrado en varios negocios: indica el slug del negocio',
      );
    }

    return candidates[0] ?? null;
  }

  private issueTokens(user: User): AuthTokens {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
      }),
      refreshToken: this.jwtService.sign(
        { sub: user.id } satisfies RefreshPayload,
        {
          secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
          expiresIn: this.config.get('JWT_REFRESH_TTL', { infer: true }),
        },
      ),
    };
  }

  private toAuthenticatedUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
    };
  }
}
