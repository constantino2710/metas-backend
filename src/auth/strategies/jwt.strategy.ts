/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
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
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
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
