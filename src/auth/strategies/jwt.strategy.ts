/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as types from '../types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!, // defina JWT_SECRET no .env
    });
  }

  /**
   * Converte o payload do token (que traz `sub`) para o objeto JwtUser esperado
   * pelos guards (@CurrentUser etc.), com `id`.
   */
  async validate(payload: any): Promise<types.JwtUser> {
    return {
      id: payload.sub ?? payload.id,   // ← MAPEIA sub → id
      sub: payload.sub,                // adiciona o campo sub
      email: payload.email,
      role: payload.role,
      clientId: payload.clientId,
      storeId: payload.storeId,
    };
  }
}
