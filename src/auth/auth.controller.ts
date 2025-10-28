/* eslint-disable prettier/prettier */
// src/auth/auth.controller.ts
import { Body, Controller, Get, HttpCode, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dtos/login.dto';
import { RefreshDto } from './dtos/refresh.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';

import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from './types';
import { JwtAuthGuard } from './jwt-auth.guard'; // ajuste o caminho se necessário
import { extractCookie } from '../common/utils/cookie.utils';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Login efetuado com sucesso' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Retorna novos access/refresh tokens' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const cookieToken = extractCookie(req, 'refreshToken', 'refresh_token');
    const token = dto.refreshToken ?? cookieToken;

    if (!token) {
      throw new UnauthorizedException('Refresh token ausente');
    }

    return this.auth.refresh(token);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(204)
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.newPassword);
  }

  // --- Protegido por JWT: retorna o usuário do token ---
  @UseGuards(JwtAuthGuard) // se você já usa guards globais (APP_GUARD), pode remover esta linha
  @Get('me')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Usuário autenticado (dados do JWT)' })
  me(@CurrentUser() user: JwtUser) {
    return user; // { sub, email, role, clientId?, storeId? }
  }
}
