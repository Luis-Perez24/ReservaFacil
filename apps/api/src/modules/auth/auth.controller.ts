import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AuthTokens,
  AuthenticatedUser,
  LoginResponse,
  RegisterBusinessResponse,
} from '@reservafacil/contracts';

import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { AuthenticatedPrincipal } from '../../shared/types/authenticated-principal';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterBusinessDto } from './dto/register-business.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-business')
  @ApiOperation({ summary: 'Registra un negocio y su dueño' })
  registerBusiness(@Body() dto: RegisterBusinessDto): Promise<RegisterBusinessResponse> {
    return this.authService.registerBusiness(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login del dashboard (OWNER o STAFF)' })
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renueva el access token' })
  refresh(@Body() dto: RefreshDto): Promise<AuthTokens> {
    return this.authService.refresh(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario del token' })
  me(@CurrentUser() principal: AuthenticatedPrincipal): Promise<AuthenticatedUser> {
    return this.authService.findAuthenticatedUser(principal.userId);
  }
}
