/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
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
import { SalesDailyQueryDto } from './dtos/sales-daily.query.dto';
import { SetDailyDto } from './dtos/set-daily.dto';

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

  // ← GRID por período
  @Get('daily')
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  daily(@CurrentUser() user: types.JwtUser, @Query() q: SalesDailyQueryDto) {
    return this.sales.daily(user, q);
  }

  // ← edição inline de um dia (grid)
  @Post('set-daily')
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  setDaily(@CurrentUser() user: types.JwtUser, @Body() dto: SetDailyDto) {
    return this.sales.setDaily(user, dto);
  }
}
