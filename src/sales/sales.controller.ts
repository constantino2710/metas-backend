/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dtos/create-sale.dto';
import { SalesListQueryDto } from './dtos/sales-list.query.dto';
import { Sale } from '@prisma/client';

@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  list(@CurrentUser() user: types.JwtUser, @Query() q: SalesListQueryDto): Promise<Sale[]> {
    return this.sales.list(user, q);
  }

  @Post()
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  create(@CurrentUser() user: types.JwtUser, @Body() dto: CreateSaleDto): Promise<Sale> {
    return this.sales.create(user, dto);
  }
}
