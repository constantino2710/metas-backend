/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Body, Controller, Get, Patch, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';

@ApiTags('stores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stores')
export class StoresController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('ADMIN', 'CLIENT_ADMIN')
  async list(@CurrentUser() user: types.JwtUser, @Query('clientId') clientId?: string) {
    const where = user.role === 'ADMIN' ? { clientId } : { clientId: user.clientId };
    return this.prisma.store.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  @Patch(':id')
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  async update(@Param('id') id: string, @Body() dto: { name?: string }, @CurrentUser() user: types.JwtUser) {
    if (user.role === 'STORE_MANAGER' && user.storeId !== id) {
      throw new ForbiddenException('Store scope mismatch');
    }
    if (user.role === 'CLIENT_ADMIN') {
      const store = await this.prisma.store.findUnique({ where: { id } });
      if (!store || store.clientId !== user.clientId) throw new ForbiddenException('Client scope mismatch');
    }
    return this.prisma.store.update({ where: { id }, data: { ...dto } });
  }
}
