/* eslint-disable prettier/prettier */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';
import { ReportsService } from './reports.service';
import { GoalsVsSalesQuery } from './dtos/goals-vs-sales.query';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('goals-vs-sales')
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  goalsVsSales(@CurrentUser() user: types.JwtUser, @Query() q: GoalsVsSalesQuery) {
    return this.reports.goalsVsSales(user, q);
  }
}
