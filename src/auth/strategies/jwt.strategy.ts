/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtUser } from '../types';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtUser): Promise<JwtUser> {
    // Você pode revalidar o usuário no DB se quiser (isActive, etc.)
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, role: true, clientId: true, storeId: true, email: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User inactive or not found');
    }

    return {
      sub: user.id,
      email: payload.email,
      role: user.role as JwtUser['role'],
      clientId: user.clientId ?? undefined,
      storeId: user.storeId ?? undefined,
    };
  }
}
