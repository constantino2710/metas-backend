/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dtos/login.dto';
import { JwtUser } from './types';

type Tokens = { accessToken: string; refreshToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  private signAccess(user: {
    id: string; email: string; role: string; clientId?: string | null; storeId?: string | null;
  }): string {
    const payload: JwtUser = {
      sub: user.id,
      email: user.email,
      role: user.role as JwtUser['role'],
      clientId: user.clientId ?? undefined,
      storeId: user.storeId ?? undefined,
      id: undefined
    };
    return this.jwt.sign(payload, {
      secret: this.cfg.get<string>('JWT_SECRET'),
      expiresIn: this.cfg.get<string>('JWT_EXPIRES_IN') ?? '15m',
    });
  }

  private signRefresh(user: { id: string; email: string }): string {
    const payload = { sub: user.id, email: user.email, tokenType: 'refresh' as const };
    return this.jwt.sign(payload, {
      secret: this.cfg.get<string>('REFRESH_SECRET'),
      expiresIn: this.cfg.get<string>('REFRESH_EXPIRES_IN') ?? '7d',
    });
  }

  private tokens(user: {
    id: string; email: string; role: string; clientId?: string | null; storeId?: string | null;
  }): Tokens {
    return {
      accessToken: this.signAccess(user),
      refreshToken: this.signRefresh(user),
    };
  }

  async login(dto: LoginDto): Promise<Tokens & {
    user: { id: string; email: string; role: string; clientId?: string | null; storeId?: string | null }
  }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, passwordHash: true, role: true, clientId: true, storeId: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Credenciais inválidas');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');

    const { accessToken, refreshToken } = this.tokens(user);
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, clientId: user.clientId, storeId: user.storeId },
    };
  }

  async refresh(refreshToken: string): Promise<Tokens> {
    try {
      const decoded = await this.jwt.verifyAsync<{ sub: string; email: string; tokenType: string }>(
        refreshToken,
        { secret: this.cfg.get<string>('REFRESH_SECRET') },
      );
      if (decoded.tokenType !== 'refresh') throw new Error('invalid type');

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { id: true, email: true, role: true, clientId: true, storeId: true, isActive: true },
      });
      if (!user || !user.isActive) throw new UnauthorizedException('Usuário inativo');

      return this.tokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token inválido/expirado');
    }
  }
}
