/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Body, Controller, Get, Param, Patch, UseGuards, ForbiddenException } from '@nestjs/common';import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('ADMIN')
  findAll() {
    return this.prisma.client.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get(':id')
  @Roles('ADMIN', 'CLIENT_ADMIN')
  async findOne(@Param('id') id: string, @CurrentUser() user: types.JwtUser) {
    if (user.role === 'CLIENT_ADMIN' && user.clientId !== id) {
      throw new ForbiddenException('Client scope mismatch');
    }
    return this.prisma.client.findUnique({ where: { id } });
  }
  
  @Patch(':id')
  @Roles('ADMIN', 'CLIENT_ADMIN')
  async update(
    @Param('id') id: string,
    @Body() dto: { name?: string },
    @CurrentUser() user: types.JwtUser,
  ) {
    if (user.role === 'CLIENT_ADMIN' && user.clientId !== id) {
      throw new ForbiddenException('Client scope mismatch');
    }
    return this.prisma.client.update({ where: { id }, data: { ...dto } });
  }
}
