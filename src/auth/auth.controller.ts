/* eslint-disable prettier/prettier */
// src/auth/auth.controller.ts
import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dtos/login.dto';
import { RefreshDto } from './dtos/refresh.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from './types';
import { JwtAuthGuard } from './jwt-auth.guard'; // ajuste o caminho se o seu guard estiver em outro lugar

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
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  // --- Protegido por JWT: retorna o usuário do token ---
  @UseGuards(JwtAuthGuard)       // se você já usa guards globais (APP_GUARD), pode remover esta linha
  @Get('me')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Usuário autenticado (dados do JWT)' })
  me(@CurrentUser() user: JwtUser) {
    return user; // { sub, email, role, clientId?, storeId? }
  }
}
