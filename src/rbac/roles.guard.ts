/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, RoleName } from './roles.decorator';
import { JwtUser } from '../auth/types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user as JwtUser | undefined;
    if (!user) throw new ForbiddenException('No user');

    if (!required.includes(user.role)) throw new ForbiddenException('Role not allowed');

    const { params, query } = req;
    if (user.role === 'STORE_MANAGER') {
      const storeId = params?.storeId ?? query?.storeId;
      if (storeId && storeId !== user.storeId) throw new ForbiddenException('Store scope mismatch');
    }
    if (user.role === 'CLIENT_ADMIN') {
      const clientId = params?.clientId ?? query?.clientId;
      if (clientId && clientId !== user.clientId) throw new ForbiddenException('Client scope mismatch');
    }
    return true;
  }
}
