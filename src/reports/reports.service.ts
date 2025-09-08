/* eslint-disable prettier/prettier */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GoalScope } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import * as types from '../auth/types';
import { GoalsVsSalesQuery } from './dtos/goals-vs-sales.query';
import { GoalResolverService } from '../goals/goal-resolver.service';
import { GoalsVsSalesResult } from './types/goals-vs-sales';
import { DailyProgressQuery } from './dtos/daily-progress.query';
import { MonthlyProgressQuery } from './dtos/monthly-progress.query';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalResolver: GoalResolverService,
  ) {}

  // ---------------------------------------------------------------
  // GOALS vs SALES
  // ---------------------------------------------------------------
  async goalsVsSales(user: types.JwtUser, q: GoalsVsSalesQuery): Promise<GoalsVsSalesResult> {
    const start = new Date(`${q.from}T00:00:00.000Z`);
    const end = new Date(`${q.to}T00:00:00.000Z`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Período inválido');
    }
    if (end < start) throw new BadRequestException('Fim anterior ao início');

    const scope = await this.resolveScope(user, q.scopeType, q.scopeId);

    const grouped = await this.prisma.sale.groupBy({
      by: ['saleDate'],
      where: {
        saleDate: { gte: start, lte: end },
        clientId: scope.clientId,
        storeId: scope.storeId,
        employeeId: scope.employeeId,
      },
      _sum: { amount: true },
      orderBy: { saleDate: 'asc' },
    });
    const salesMap = new Map<string, number>();
    for (const g of grouped) {
      const dISO = new Date(g.saleDate as unknown as Date).toISOString().slice(0, 10);
      salesMap.set(dISO, Number(g._sum.amount || 0));
    }

    const daily: { date: string; realized: number; goal: number; superGoal: number }[] = [];
    const totals = { realized: 0, goal: 0, superGoal: 0 };

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const realized = salesMap.get(iso) ?? 0;
      const gr = await this.goalResolver.resolve({
        clientId: scope.clientId,
        storeId: scope.storeId,
        employeeId: scope.employeeId,
        date: new Date(d),
      });
      const goal = gr?.goal ?? 0;
      const superGoal = gr?.superGoal ?? 0;
      daily.push({ date: iso, realized, goal, superGoal });
      totals.realized += realized;
      totals.goal += goal;
      totals.superGoal += superGoal;
    }

    let series = daily;
    if (q.granularity === 'monthly') {
      const map = new Map<string, { realized: number; goal: number; superGoal: number }>();
      for (const item of daily) {
        const month = item.date.slice(0, 7);
        if (!map.has(month)) map.set(month, { realized: 0, goal: 0, superGoal: 0 });
        const agg = map.get(month)!;
        agg.realized += item.realized;
        agg.goal += item.goal;
        agg.superGoal += item.superGoal;
      }
      series = Array.from(map.entries()).map(([m, agg]) => ({ date: m, ...agg }));
    }

    return { series, totals };
  }
    // ---------------------------------------------------------------
  // DAILY PROGRESS
  // ---------------------------------------------------------------
  async dailyProgress(user: types.JwtUser, q: DailyProgressQuery) {
    const dateStr = q.date ?? new Date().toISOString().slice(0, 10);
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (isNaN(date.getTime())) throw new BadRequestException('Data inválida');

    const scope = await this.resolveScope(user, q.scopeType, q.scopeId);

    const sales = await this.prisma.sale.aggregate({
      _sum: { amount: true },
      where: {
        saleDate: date,
        clientId: scope.clientId,
        storeId: scope.storeId,
        employeeId: scope.employeeId,
      },
    });

    const realized = Number(sales._sum.amount || 0);

    const gr = await this.goalResolver.resolve({
      clientId: scope.clientId,
      storeId: scope.storeId,
      employeeId: scope.employeeId,
      date,
    });
    const goal = gr?.goal ?? 0;
    const superGoal = gr?.superGoal ?? 0;
    const percentage = goal > 0 ? Math.round((realized / goal) * 10000) / 100 : 0;

    return { date: dateStr, realized, goal, superGoal, percentage };
  }
    async monthlyProgress(user: types.JwtUser, q: MonthlyProgressQuery) {
    const dateStr = q.date ?? new Date().toISOString().slice(0, 10);
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (isNaN(date.getTime())) throw new BadRequestException('Data inválida');

    const scope = await this.resolveScope(user, q.scopeType, q.scopeId);

    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

    const salesAgg = await this.prisma.sale.aggregate({
      _sum: { amount: true },
      where: {
        saleDate: { gte: start, lte: date },
        clientId: scope.clientId,
        storeId: scope.storeId,
        employeeId: scope.employeeId,
      },
    });
    const realized = Number(salesAgg._sum.amount || 0);

    let goal = 0;
    let superGoal = 0;
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const gr = await this.goalResolver.resolve({
        clientId: scope.clientId,
        storeId: scope.storeId,
        employeeId: scope.employeeId,
        date: new Date(d),
      });
      goal += gr?.goal ?? 0;
      superGoal += gr?.superGoal ?? 0;
    }

    const percentage = goal > 0 ? Math.round((realized / goal) * 10000) / 100 : 0;

    return {
      month: start.toISOString().slice(0, 7),
      date: dateStr,
      realized,
      goal,
      superGoal,
      percentage,
    };
  }


  // ---------------------------------------------------------------
  // RBAC scope resolution
  // ---------------------------------------------------------------
  private async resolveScope(
    user: types.JwtUser,
    scopeType: GoalScope,
    scopeId: string,
  ): Promise<{ clientId: string; storeId?: string; employeeId?: string }> {
    if (scopeType === GoalScope.CLIENT) {
      if (user.role === 'ADMIN') return { clientId: scopeId };
      if (user.role === 'CLIENT_ADMIN' && user.clientId === scopeId) return { clientId: scopeId };
      throw new ForbiddenException();
    }
    if (scopeType === GoalScope.STORE) {
      const store = await this.prisma.store.findUnique({
        where: { id: scopeId },
        select: { id: true, clientId: true },
      });
      if (!store) throw new NotFoundException('Loja não encontrada');
      if (user.role === 'ADMIN') return { clientId: store.clientId, storeId: store.id };
      if (user.role === 'CLIENT_ADMIN' && user.clientId === store.clientId)
        return { clientId: store.clientId, storeId: store.id };
      if (user.role === 'STORE_MANAGER' && user.storeId === store.id)
        return { clientId: store.clientId, storeId: store.id };
      throw new ForbiddenException();
    }
    if (scopeType === GoalScope.EMPLOYEE) {
      const emp = await this.prisma.employee.findUnique({
        where: { id: scopeId },
        select: { id: true, storeId: true, store: { select: { clientId: true } } },
      });
      if (!emp) throw new NotFoundException('Funcionário não encontrado');
      if (user.role === 'ADMIN')
        return { clientId: emp.store.clientId, storeId: emp.storeId, employeeId: emp.id };
      if (user.role === 'CLIENT_ADMIN' && user.clientId === emp.store.clientId)
        return { clientId: emp.store.clientId, storeId: emp.storeId, employeeId: emp.id };
      if (user.role === 'STORE_MANAGER' && user.storeId === emp.storeId)
        return { clientId: emp.store.clientId, storeId: emp.storeId, employeeId: emp.id };
      throw new ForbiddenException();
    }
    throw new BadRequestException('Escopo inválido');
  }
}