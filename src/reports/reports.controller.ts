/* eslint-disable prettier/prettier */
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';
import { Roles } from '../auth/roles.decorator';

import { GoalsVsSalesQuery, ReportScope } from './dtos/goals-vs-sales.query';
import { DailyProgressQuery } from './dtos/daily-progress.query';
import { MonthlyProgressQuery } from './dtos/monthly-progress.query';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('goals-vs-sales')
  @Roles(types.Role.ADMIN, types.Role.CLIENT_ADMIN, types.Role.STORE_MANAGER)
  async goalsVsSales(@CurrentUser() user: types.JwtUser, @Query() q: GoalsVsSalesQuery) {
    this.ensurePeriod(q);
    this.ensureIdIfNeeded(q.scope, q.id);
    this.fillMissingDate(q);
    if (!q.start || !q.end) {
      throw new BadRequestException('start e end são obrigatórios');
    }
    return this.reports.goalsVsSales(user, q as Required<Pick<GoalsVsSalesQuery, 'start' | 'end'>> & GoalsVsSalesQuery);
  }

  @Get('daily-progress')
  @Roles(types.Role.ADMIN, types.Role.CLIENT_ADMIN, types.Role.STORE_MANAGER)
  async dailyProgress(@CurrentUser() user: types.JwtUser, @Query() q: DailyProgressQuery) {
    this.ensurePeriod(q);
    this.ensureIdIfNeeded(q.scope, q.id);
    this.fillMissingDate(q);
    if (!q.start || !q.end) {
      throw new BadRequestException('start e end são obrigatórios');
    }
    return this.reports.dailyProgress(user, q as Required<Pick<DailyProgressQuery, 'start' | 'end'>> & DailyProgressQuery);
  }

  @Get('monthly-progress')
  @Roles(types.Role.ADMIN, types.Role.CLIENT_ADMIN, types.Role.STORE_MANAGER)
  async monthlyProgress(@CurrentUser() user: types.JwtUser, @Query() q: MonthlyProgressQuery) {
    this.ensurePeriod(q);
    this.ensureIdIfNeeded(q.scope, q.id);
    this.fillMissingDate(q);
    if (!q.start || !q.end) {
      throw new BadRequestException('start e end são obrigatórios');
    }
    return this.reports.monthlyProgress(user, q as Required<Pick<MonthlyProgressQuery, 'start' | 'end'>> & MonthlyProgressQuery);
  }

  // ---------- helpers de controller ----------

  /** exige que tenha pelo menos start ou end */
  private ensurePeriod(q: { start?: string; end?: string }) {
    if (!q.start && !q.end) {
      throw new BadRequestException('Informe start e/ou end (YYYY-MM-DD)');
    }
  }

  /** se escopo não for SYSTEM, exige id */
  private ensureIdIfNeeded(scope: ReportScope, id?: string) {
    if (scope !== ReportScope.SYSTEM && !id) {
      throw new BadRequestException('id é obrigatório para esse escopo');
    }
  }

  /** completa data faltante para cobrir o mês */
  private fillMissingDate(q: { start?: string; end?: string }) {
    if (!q.start && q.end) {
      const d = new Date(q.end + 'T00:00:00Z');
      if (Number.isNaN(+d)) throw new BadRequestException('end inválido');
      const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      q.start = start.toISOString().slice(0, 10);
    } else if (q.start && !q.end) {
      const d = new Date(q.start + 'T00:00:00Z');
      if (Number.isNaN(+d)) throw new BadRequestException('start inválido');
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      q.end = end.toISOString().slice(0, 10);
    }
  }
}
