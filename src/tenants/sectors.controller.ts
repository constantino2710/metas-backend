/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Param, Post, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';

@ApiTags('sectors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stores/:storeId/sectors')
export class SectorsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  async list(@CurrentUser() user: types.JwtUser, @Param('storeId') storeId: string) {
    await this.assertScope(user, storeId);
    return this.prisma.sector.findMany({ where: { storeId, isActive: true }, orderBy: { createdAt: 'desc' } });
  }

  @Post()
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  async create(
    @CurrentUser() user: types.JwtUser,
    @Param('storeId') storeId: string,
    @Body() dto: { name: string },
  ) {
    await this.assertScope(user, storeId);
    return this.prisma.sector.create({ data: { storeId, name: dto.name } });
  }

  private async assertScope(user: types.JwtUser, storeId: string) {
    if (user.role === 'STORE_MANAGER') {
      if (user.storeId !== storeId) throw new ForbiddenException('Store scope mismatch');
      return;
    }
    if (user.role === 'CLIENT_ADMIN') {
      const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { clientId: true } });
      if (!store || store.clientId !== user.clientId) throw new ForbiddenException('Client scope mismatch');
    }
  }
}