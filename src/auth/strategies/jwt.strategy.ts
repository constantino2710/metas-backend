/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';

import { extractCookie } from '../../common/utils/cookie.utils';
import { JwtUser, Role } from '../types';

type JwtPayload = {
  sub: string;                // user.id
  role: Role | string;
  clientId?: string | null;
  storeId?: string | null;
  iat?: number;
  exp?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly cfg: ConfigService) {
    const fromBearer = ExtractJwt.fromAuthHeaderAsBearerToken();
    const fromCookies = (req: Request): string | null =>
      extractCookie(req, 'accessToken', 'access_token', 'authorization');

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([fromBearer, fromCookies]),
      ignoreExpiration: false,
      secretOrKey: cfg.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtUser> {
    return {
      id: payload.sub,                      // mapeia sub -> id
      role: payload.role as Role,
      clientId: payload.clientId ?? null,
      storeId: payload.storeId ?? null,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}
