/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
// src/auth/jwt-auth.guard.ts
import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

// Palavras-chave que costumam aparecer quando o token está ausente
const isTokenMissingMessage = (message: string) => {
  const m = message.toLowerCase();
  return (
    m.includes('no auth token') ||
    m.includes('jwt must be provided') ||
    m.includes('no authorization header') ||
    m.includes('bearer token not found')
  );
};

// Palavras-chave para token inválido/malformado
const isTokenInvalidMessage = (message: string) => {
  const m = message.toLowerCase();
  return (
    m.includes('jwt malformed') ||
    m.includes('invalid token') ||
    m.includes('invalid signature')
  );
};

const extractMessage = (input: unknown): string | null => {
  if (!input) return null;
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && 'message' in (input as Record<string, unknown>)) {
    const maybeMessage = (input as Record<string, unknown>).message;
    if (typeof maybeMessage === 'string') return maybeMessage;
  }
  return null;
};

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Rota/Classe marcada como @Public() não exige JWT
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Fluxo normal do AuthGuard('jwt')
    return super.canActivate(context);
  }

  // Se estiver usando GraphQL/WS e quiser suportar:
  // getRequest(context: ExecutionContext) {
  //   const ctxType = context.getType<string>();
  //   if (ctxType === 'http') return context.switchToHttp().getRequest();
  //   if (ctxType === 'graphql') {
  //     const gqlCtx = GqlExecutionContext.create(context);
  //     return gqlCtx.getContext().req;
  //   }
  //   return context.switchToHttp().getRequest();
  // }

  handleRequest<TUser = any>(err: any, user: any, info: any, context: ExecutionContext, status?: any): TUser {
    if (!err && user) return user as TUser;

    const source = extractMessage(err) ?? extractMessage(info) ?? '';

    if (source && isTokenMissingMessage(source)) {
      throw new UnauthorizedException('Access token ausente');
    }

    if (source && isTokenInvalidMessage(source)) {
      throw new UnauthorizedException('Access token inválido');
    }

    // Detecta expiração vinda do jwt/JsonWebTokenError
    const candidates = [err, info];
    for (const c of candidates) {
      if (typeof c === 'object' && c && 'name' in c) {
        const name = (c as Record<string, unknown>).name;
        if (name === 'TokenExpiredError') {
          throw new UnauthorizedException('Access token expirado');
        }
      }
    }

    // Genérica
    throw new UnauthorizedException('Credenciais inválidas');
  }
}
