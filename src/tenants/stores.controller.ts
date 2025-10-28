/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';

@Controller('tenants/stores')
export class StoresController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: types.JwtUser, @Query() q: any) {
    const where: Prisma.StoreWhereInput = {};

    if (q?.name) where.name = { contains: String(q.name), mode: 'insensitive' };

    // filtro opcional por clientId via query
    if (q?.clientId) {
      where.clientId = String(q.clientId);
    }

    // escopo do CLIENT_ADMIN (apenas se houver clientId string não-vazia)
    if (user.role === types.Role.CLIENT_ADMIN && typeof user.clientId === 'string' && user.clientId) {
      // importante: nunca atribuir null/undefined — somente string
      where.clientId = user.clientId as string;
      // alternativa estruturada:
      // where.clientId = { equals: user.clientId as string };
    }

    return this.prisma.store.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
