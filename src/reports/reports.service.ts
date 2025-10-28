/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { JwtUser, Role } from '../auth/types';
import { GoalResolverService } from '../goals/goal-resolver.service';

type Scope = 'SYSTEM' | 'CLIENT' | 'STORE' | 'EMPLOYEE';
type Period = { start: string; end: string };

type OverviewResult = {
  scope: Scope;
  id?: string;
  period: { start: string; end: string; days: number; daysElapsed: number };
  total: number;
  totalsByDay: { date: string; total: number }[];
  goal?: { daily?: number; month?: number };
  superGoal?: { daily?: number; month?: number };
  attainment?: { goal?: number; superGoal?: number }; // %
  projection: number;
};

type LeaderboardRow = { id: string; label: string; total: number };
type LeaderboardResult = {
  period: { start: string; end: string };
  rows: LeaderboardRow[];
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalResolver: GoalResolverService,
  ) {}

  // ===================================================================================
  // PUBLIC API
  // ===================================================================================

  /** Visão geral do período para um escopo */
  async overview(
    user: JwtUser,
    q: { scope: Scope; id?: string } & Period,
  ): Promise<OverviewResult> {
    this.validateDates(q);

    const { where, scopeCheck } = await this.buildWhereForScope(user, q.scope, q.id);
    await scopeCheck();

    const start = new Date(q.start + 'T00:00:00.000Z');
    const end = new Date(q.end + 'T23:59:59.999Z');
    const days = this.everyDateStr(start, end);
    const daysElapsed = this.daysElapsedInclusive(start, end);

    // Série por dia (somatório de amount)
    const grouped = await this.prisma.sale.groupBy({
      by: ['saleDate'],
      where: { ...where, saleDate: { gte: start, lte: end } },
      _sum: { amount: true },
      orderBy: { saleDate: 'asc' },
    });

    const byDay = new Map<string, number>();
    for (const g of grouped) {
      const dISO = this.dateISO(g.saleDate as unknown as Date);
      byDay.set(dISO, Number(g._sum.amount ?? 0));
    }

    const totalsByDay = days.map((d) => ({ date: d, total: byDay.get(d) ?? 0 }));
    const total = totalsByDay.reduce((a, b) => a + b.total, 0);

    // Meta efetiva (diária) do escopo
    const { goalDaily, superDaily } = await this.resolveScopeDailyGoal(q.scope, q.id, start);
    const goalMonth = goalDaily != null ? Math.round(goalDaily * days.length) : undefined;
    const superMonth = superDaily != null ? Math.round(superDaily * days.length) : undefined;

    // Projeção com média apenas dos dias que já tiveram vendas > 0
    const filled = totalsByDay.slice(0, daysElapsed).map(x => x.total).filter(v => v > 0);
    const sumFilled = filled.reduce((a, b) => a + b, 0);
    const avgFilled = filled.length > 0 ? sumFilled / filled.length : 0;
    const projection = Math.round(sumFilled + avgFilled * (days.length - filled.length));

    const attainmentGoal =
      goalMonth && goalMonth > 0 ? Math.min(100, (total / goalMonth) * 100) : undefined;
    const attainmentSuper =
      superMonth && superMonth > 0 ? Math.min(100, (total / superMonth) * 100) : undefined;

    return {
      scope: q.scope,
      id: q.id,
      period: { start: q.start, end: q.end, days: days.length, daysElapsed },
      total,
      totalsByDay,
      goal: { daily: goalDaily, month: goalMonth },
      superGoal: { daily: superDaily, month: superMonth },
      attainment: { goal: to2(attainmentGoal), superGoal: to2(attainmentSuper) },
      projection,
    };
  }

  /** Ranking de funcionários de uma loja */
  async leaderboardEmployees(
    user: JwtUser,
    q: { storeId: string } & Period & { limit?: number },
  ): Promise<LeaderboardResult> {
    this.validateDates(q);
    await this.assertScopeStore(user, q.storeId);

    const start = new Date(q.start + 'T00:00:00.000Z');
    const end = new Date(q.end + 'T23:59:59.999Z');

    const data = await this.prisma.sale.groupBy({
      by: ['employeeId'],
      where: { storeId: q.storeId, saleDate: { gte: start, lte: end } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    const ids = data.map((d) => d.employeeId).filter(Boolean) as string[];
    const emps = await this.prisma.employee.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    const nameById = new Map(emps.map((e) => [e.id, e.fullName]));

    const rows = data
      .map((d) => ({
        id: String(d.employeeId),
        label: nameById.get(String(d.employeeId)) ?? String(d.employeeId),
        total: Number(d._sum.amount ?? 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, Math.max(1, q.limit ?? 20));

    return { period: { start: q.start, end: q.end }, rows };
  }

  /** Ranking de lojas de um cliente (ou todas se ADMIN) */
  async storesRanking(
    user: JwtUser,
    q: ({ clientId?: string } & Period) & { limit?: number },
  ): Promise<LeaderboardResult> {
    this.validateDates(q);

    const start = new Date(q.start + 'T00:00:00.000Z');
    const end = new Date(q.end + 'T23:59:59.999Z');

    const where: Prisma.SaleWhereInput = { saleDate: { gte: start, lte: end } };

    if (user.role === Role.CLIENT_ADMIN) {
      where.clientId = user.clientId ?? undefined;
      if (q.clientId && q.clientId !== user.clientId) {
        throw new ForbiddenException('Cliente fora do seu escopo');
      }
    } else if (user.role === Role.STORE_MANAGER) {
      throw new ForbiddenException('Ranking de lojas indisponível para gerente de loja');
    } else {
      // ADMIN
      if (q.clientId) where.clientId = q.clientId;
    }

    const data = await this.prisma.sale.groupBy({
      by: ['storeId'],
      where,
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    const ids = data.map((d) => d.storeId).filter(Boolean) as string[];
    const stores = await this.prisma.store.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(stores.map((s) => [s.id, s.name]));

    const rows = data
      .map((d) => ({
        id: String(d.storeId),
        label: nameById.get(String(d.storeId)) ?? String(d.storeId),
        total: Number(d._sum.amount ?? 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, Math.max(1, q.limit ?? 50));

    return { period: { start: q.start, end: q.end }, rows };
  }

  // -----------------------------------------------------------------------------------
  // NOVOS MÉTODOS (para o seu ReportsController)
  // -----------------------------------------------------------------------------------

  /** goalsVsSales: consolida vendas totais vs meta e super meta do período */
  async goalsVsSales(
    user: JwtUser,
    q: { scope: Scope; id?: string } & Period,
  ) {
    const ov = await this.overview(user, q);
    return {
      period: ov.period,
      total: ov.total,
      goal: ov.goal,             // { daily, month }
      superGoal: ov.superGoal,   // { daily, month }
      attainment: ov.attainment, // { goal: %, superGoal: % }
      projection: ov.projection,
    };
  }

  /** dailyProgress: série diária + linhas de meta acumulada e super meta acumulada */
  async dailyProgress(
    user: JwtUser,
    q: { scope: Scope; id?: string } & Period,
  ) {
    const ov = await this.overview(user, q);
    const days = ov.totalsByDay.map(d => d.date);
    const values = ov.totalsByDay.map(d => d.total);

    // acumulado de vendas
    const cumulative: number[] = [];
    let acc = 0;
    for (const v of values) {
      acc += v;
      cumulative.push(acc);
    }

    // linhas de meta acumulada (se houver goalDaily/superDaily)
    const goalDaily = ov.goal?.daily ?? 0;
    const superDaily = ov.superGoal?.daily ?? 0;

    const goalCumulative = goalDaily
      ? days.map((_, i) => Math.round(goalDaily * (i + 1)))
      : undefined;

    const superCumulative = superDaily
      ? days.map((_, i) => Math.round(superDaily * (i + 1)))
      : undefined;

    return {
      period: ov.period,
      days,
      values,            // vendas do dia
      cumulative,        // vendas acumuladas
      goalDaily: ov.goal?.daily,
      superDaily: ov.superGoal?.daily,
      goalCumulative,
      superCumulative,
    };
  }

  /** monthlyProgress: consolida por mês (YYYY-MM) dentro do período, com metas do mês */
  async monthlyProgress(
    user: JwtUser,
    q: { scope: Scope; id?: string } & Period,
  ) {
    this.validateDates(q);

    // Reaproveita série diária do overview para somar por mês
    const ov = await this.overview(user, q);

    // Gera limites mensais
    const months = this.monthSpans(q.start, q.end); // [{ ym:'2025-10', startISO, endISO, days }]

    // Indexa vendas por dia
    const byDay = new Map<string, number>(
      ov.totalsByDay.map(x => [x.date, x.total]),
    );

    const rows: {
      month: string;
      start: string;
      end: string;
      sales: number;
      goalMonth?: number;
      superMonth?: number;
      attainment: { goal?: number; superGoal?: number };
    }[] = [];
    for (const m of months) {
      // soma das vendas do mês
      let sales = 0;
      const d0 = new Date(m.startISO + 'T00:00:00.000Z');
      const d1 = new Date(m.endISO + 'T00:00:00.000Z');
      for (let d = new Date(d0); d <= d1; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0,10);
        sales += byDay.get(iso) ?? 0;
      }

      // meta diária efetiva no 1º dia do mês × dias no mês
      const firstDay = new Date(m.startISO + 'T00:00:00.000Z');
      const { goalDaily, superDaily } = await this.resolveScopeDailyGoal(q.scope, q.id, firstDay);
      const goalMonth = goalDaily ? Math.round(goalDaily * m.days) : undefined;
      const superMonth = superDaily ? Math.round(superDaily * m.days) : undefined;

      const attainmentGoal =
        goalMonth && goalMonth > 0 ? Math.min(100, (sales / goalMonth) * 100) : undefined;

      const attainmentSuper =
        superMonth && superMonth > 0 ? Math.min(100, (sales / superMonth) * 100) : undefined;

      rows.push({
        month: m.ym,             // 'YYYY-MM'
        start: m.startISO,
        end: m.endISO,
        sales,
        goalMonth,
        superMonth,
        attainment: { goal: to2(attainmentGoal), superGoal: to2(attainmentSuper) },
      });
    }

    const total = rows.reduce((a, r) => a + r.sales, 0);

    return {
      period: ov.period,
      total,
      rows,
    };
  }

  // ===================================================================================
  // HELPERS
  // ===================================================================================

  private validateDates(p: Period) {
    if (!p.start && !p.end) {
      throw new BadRequestException('Informe start e/ou end (YYYY-MM-DD)');
    }
    const s = new Date((p.start ?? p.end) + 'T00:00:00.000Z');
    const e = new Date((p.end ?? p.start) + 'T00:00:00.000Z');
    if (Number.isNaN(+s) || Number.isNaN(+e)) {
      throw new BadRequestException('Datas inválidas');
    }
    if (s > e) throw new BadRequestException('Fim anterior ao início');
  }

  private dateISO(d: Date) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
      .toISOString()
      .slice(0, 10);
  }

  private everyDateStr(start: Date, end: Date) {
    const out: string[] = [];
    const d = new Date(start);
    d.setUTCHours(0, 0, 0, 0);
    const e = new Date(end);
    e.setUTCHours(0, 0, 0, 0);
    while (d <= e) {
      out.push(this.dateISO(d));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }

  /** considera hoje quando o fim está no futuro */
  private daysElapsedInclusive(start: Date, end: Date) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const end0 = new Date(end);
    end0.setUTCHours(0, 0, 0, 0);
    const minRef = today.getTime() < end0.getTime() ? today : end0;
    const delta = Math.floor((minRef.getTime() - start.getTime()) / 86_400_000) + 1;
    const total = Math.floor((end0.getTime() - start.getTime()) / 86_400_000) + 1;
    if (delta < 0) return 0;
    if (delta > total) return total;
    return delta;
  }

  /** Monta where por escopo + uma função para validar RBAC/IDs */
  private async buildWhereForScope(
    user: JwtUser,
    scope: Scope,
    id?: string,
  ): Promise<{ where: Prisma.SaleWhereInput; scopeCheck: () => Promise<void> }> {
    const where: Prisma.SaleWhereInput = {};

    // SYSTEM
    if (scope === 'SYSTEM') {
      return {
        where,
        scopeCheck: async () => {
          if (user.role !== Role.ADMIN) throw new ForbiddenException();
        },
      };
    }

    // CLIENT
    if (scope === 'CLIENT') {
      return {
        where: { clientId: id },
        scopeCheck: async () => {
          if (!id) throw new BadRequestException('clientId é obrigatório');
          if (user.role === Role.CLIENT_ADMIN && user.clientId !== id)
            throw new ForbiddenException('Cliente fora do seu escopo');
          if (user.role === Role.STORE_MANAGER)
            throw new ForbiddenException('Gerente de loja não acessa escopo cliente');
        },
      };
    }

    // STORE
    if (scope === 'STORE') {
      return {
        where: { storeId: id },
        scopeCheck: async () => {
          if (!id) throw new BadRequestException('storeId é obrigatório');
          const store = await this.prisma.store.findUnique({
            where: { id },
            select: { id: true, clientId: true },
          });
          if (!store) throw new BadRequestException('Loja não encontrada');
          if (user.role === Role.CLIENT_ADMIN && user.clientId !== store.clientId)
            throw new ForbiddenException('Loja fora do seu escopo');
          if (user.role === Role.STORE_MANAGER && user.storeId !== store.id)
            throw new ForbiddenException('Loja fora do seu escopo');
        },
      };
    }

    // EMPLOYEE
    return {
      where: { employeeId: id },
      scopeCheck: async () => {
        if (!id) throw new BadRequestException('employeeId é obrigatório');
        const emp = await this.prisma.employee.findUnique({
          where: { id },
          select: { storeId: true, store: { select: { clientId: true } } },
        });
        if (!emp) throw new BadRequestException('Funcionário não encontrado');

        if (user.role === Role.CLIENT_ADMIN && user.clientId !== emp.store.clientId)
          throw new ForbiddenException('Funcionário fora do seu escopo');

        if (user.role === Role.STORE_MANAGER && user.storeId !== emp.storeId)
          throw new ForbiddenException('Funcionário fora do seu escopo');
      },
    };
  }

  /** Resolve a meta diária efetiva do escopo fornecido */
  private async resolveScopeDailyGoal(
    scope: Scope,
    id: string | undefined,
    date: Date,
  ): Promise<{ goalDaily?: number; superDaily?: number }> {
    if (scope === 'SYSTEM') return {};
    if (!id) return {};

    if (scope === 'EMPLOYEE') {
      const res = await this.goalResolver.resolve({ employeeId: id, date });
      return { goalDaily: res?.goal, superDaily: res?.superGoal };
    }
    if (scope === 'STORE') {
      const res = await this.goalResolver.resolve({ storeId: id, date });
      return { goalDaily: res?.goal, superDaily: res?.superGoal };
    }
    if (scope === 'CLIENT') {
      const res = await this.goalResolver.resolve({ clientId: id, date });
      return { goalDaily: res?.goal, superDaily: res?.superGoal };
    }
    return {};
  }

  /** Quebra o intervalo em meses (YYYY-MM) com limites e número de dias */
  private monthSpans(startISO: string, endISO: string) {
    const start = new Date(startISO + 'T00:00:00.000Z');
    const end = new Date(endISO + 'T00:00:00.000Z');
    const spans: { ym: string; startISO: string; endISO: string; days: number }[] = [];

    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();

    while (true) {
      const monthStart = new Date(Date.UTC(y, m, 1));
      const monthEnd = new Date(Date.UTC(y, m + 1, 0));
      const spanStart = monthStart < start ? start : monthStart;
      const spanEnd = monthEnd > end ? end : monthEnd;

      if (spanStart <= spanEnd) {
        const ym = `${y.toString().padStart(4,'0')}-${(m+1).toString().padStart(2,'0')}`;
        const days = Math.floor((+new Date(Date.UTC(spanEnd.getUTCFullYear(), spanEnd.getUTCMonth(), spanEnd.getUTCDate())) -
                                 +new Date(Date.UTC(spanStart.getUTCFullYear(), spanStart.getUTCMonth(), spanStart.getUTCDate()))) / 86_400_000) + 1;
        spans.push({
          ym,
          startISO: spanStart.toISOString().slice(0,10),
          endISO: spanEnd.toISOString().slice(0,10),
          days,
        });
      }

      // próximo mês
      if (y > end.getUTCFullYear() || (y === end.getUTCFullYear() && m >= end.getUTCMonth())) break;
      m++;
      if (m >= 12) { m = 0; y++; }
      if (y > end.getUTCFullYear() || (y === end.getUTCFullYear() && m > end.getUTCMonth())) break;
    }

    return spans;
  }

  // -----------------------------------------------------------------------------------
  // Regras auxiliares já usadas em outros relatórios
  // -----------------------------------------------------------------------------------

  private async assertScopeStore(user: JwtUser, storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, clientId: true },
    });
    if (!store) throw new BadRequestException('Loja não encontrada');

    if (user.role === Role.CLIENT_ADMIN && store.clientId !== user.clientId)
      throw new ForbiddenException('Loja fora do seu escopo');

    if (user.role === Role.STORE_MANAGER && store.id !== user.storeId)
      throw new ForbiddenException('Loja fora do seu escopo');
  }
}

// util
function to2(n?: number) {
  return typeof n === 'number' ? Math.round(n * 100) / 100 : undefined;
}
