/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dtos/login.dto';
import { JwtUser } from './types';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';

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
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        clientId: user.clientId ?? undefined,
        storeId: user.storeId ?? undefined,
      },

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
  
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return; // não expõe existência

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 60); // 1h

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: tokenHash, resetTokenExpires: expires },
    });

    const transporter = nodemailer.createTransport({
      host: this.cfg.get<string>('SMTP_HOST'),
      port: Number(this.cfg.get<string>('SMTP_PORT') ?? 0),
      auth: {
        user: this.cfg.get<string>('SMTP_USER'),
        pass: this.cfg.get<string>('SMTP_PASS'),
      },
    });

    const urlBase = this.cfg.get<string>('RESET_PASSWORD_URL') ?? '';
    const url = `${urlBase}?token=${token}`;
    await transporter.sendMail({
      to: email,
      subject: 'Redefinição de senha',
      text: `Clique para redefinir: ${url}`,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findFirst({
      where: {
        resetTokenHash: tokenHash,
        resetTokenExpires: { gt: new Date() },
      },
    });
    if (!user) throw new BadRequestException('Token inválido ou expirado');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetTokenHash: null, resetTokenExpires: null },
    });
  }
}
