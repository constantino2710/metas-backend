/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JwtUser, Role } from '../auth/types';
import { GoalScope } from '@prisma/client';
import { GoalsEffectiveQueryDto } from './dtos/goals-effective.query.dto';
import { CreateGoalDto } from './dtos/create-goal.dto';

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureUser(user?: JwtUser): asserts user is JwtUser {
    if (!user || typeof (user as any).role !== 'string') {
      throw new ForbiddenException('Usuário não autenticado');
    }
  }

  async getEffective(user: JwtUser, q: GoalsEffectiveQueryDto) {
    this.ensureUser(user);
    return this.effective(user, q);
  }

  async effective(user: JwtUser, q: GoalsEffectiveQueryDto) {
    this.ensureUser(user);

    const dateStr = q.date ?? new Date().toISOString().slice(0, 10);
    const date = new Date(dateStr + 'T00:00:00.000Z');
    if (Number.isNaN(+date)) {
      throw new BadRequestException('Data inválida (YYYY-MM-DD)');
    }

    const daysInMonth = this.daysInMonth(date);
    const { scopeType, scopeId } = await this.resolveScope(user, q);

    if (scopeType === GoalScope.STORE) {
      const aggregated = await this.sumStoreGoals(scopeId, date);
      if (!aggregated) {
        return {
          scopeType,
          scopeId,
          goal: undefined,
          superGoal: undefined,
          metaDaily: undefined,
          superDaily: undefined,
          metaMonth: undefined,
          supermetaMonth: undefined,
          period: { start: undefined, end: dateStr },
        };
      }

      const metaDaily = aggregated.goal;
      const superDaily = aggregated.superGoal;
      const metaMonth = Math.round(metaDaily * daysInMonth);
      const supermetaMonth = Math.round(superDaily * daysInMonth);

      return {
        scopeType,
        scopeId,
        goal: metaDaily,
        superGoal: superDaily,
        metaDaily,
        superDaily,
        metaMonth,
        supermetaMonth,
        period: { start: undefined, end: dateStr },
      };
    }

    const policy = await this.prisma.goalPolicy.findFirst({
      where: {
        scopeType,
        scopeId,
        effectiveFrom: { lte: date },
      },
      orderBy: { effectiveFrom: 'desc' },
      select: { metaDaily: true, supermetaDaily: true, effectiveFrom: true },
    });

    if (!policy) {
      return {
        scopeType,
        scopeId,
        goal: undefined,
        superGoal: undefined,
        metaDaily: undefined,
        superDaily: undefined,
        metaMonth: undefined,
        supermetaMonth: undefined,
        period: { start: undefined, end: dateStr },
      };
    }

    const metaDaily =
      policy.metaDaily !== null && policy.metaDaily !== undefined
        ? Number(policy.metaDaily)
        : undefined;

    let superDaily: number | undefined;
    if (policy.supermetaDaily !== null && policy.supermetaDaily !== undefined) {
      superDaily = Number(policy.supermetaDaily);
    } else if (metaDaily !== undefined) {
      superDaily = Math.ceil(metaDaily * 1.3);
    }

    const metaMonth = metaDaily ? Math.round(metaDaily * daysInMonth) : undefined;
    const supermetaMonth = superDaily ? Math.round(superDaily * daysInMonth) : undefined;

    return {
      scopeType,
      scopeId,
      goal: metaDaily,
      superGoal: superDaily,
      metaDaily,
      superDaily,
      metaMonth,
      supermetaMonth,
      period: {
        start: policy.effectiveFrom.toISOString().slice(0, 10),
        end: dateStr,
      },
    };
  }

  async create(user: JwtUser, dto: CreateGoalDto) {
    this.ensureUser(user);

    await this.assertCreateScope(user, dto.scopeType, dto.scopeId);

    if (dto.scopeType === GoalScope.STORE) {
      throw new BadRequestException(
        'Metas diárias devem ser definidas por setor. Cadastre setores para a loja.',
      );
    }

    const effectiveFrom = new Date(dto.effectiveFrom + 'T00:00:00.000Z');
    if (Number.isNaN(+effectiveFrom)) {
      throw new BadRequestException('effectiveFrom inválido (YYYY-MM-DD)');
    }

    const monthStart = new Date(
      Date.UTC(effectiveFrom.getUTCFullYear(), effectiveFrom.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(effectiveFrom.getUTCFullYear(), effectiveFrom.getUTCMonth() + 1, 0),
    );
    const totalDays = dto.workdaysOnly
      ? this.countWorkdaysInclusive(monthStart, monthEnd)
      : this.daysInclusive(monthStart, monthEnd);

    let metaDaily = dto.metaDaily;
    if (metaDaily === undefined) {
      if (dto.metaMonthly === undefined) {
        throw new BadRequestException('Informe metaDaily OU metaMonthly');
      }
      metaDaily = Math.ceil(Number(dto.metaMonthly) / Math.max(totalDays, 1));
    }

    let supermetaDaily = dto.supermetaDaily;
    if (supermetaDaily === undefined) {
      if (dto.supermetaMonthly !== undefined) {
        supermetaDaily = Math.ceil(Number(dto.supermetaMonthly) / Math.max(totalDays, 1));
      } else {
        const superPercent = dto.superPercent ?? 30;
        supermetaDaily = Math.ceil(Number(metaDaily) * (1 + superPercent / 100));
      }
    }

    const created = await this.prisma.goalPolicy.create({
      data: {
        scopeType: dto.scopeType,
        scopeId: dto.scopeId,
        metaDaily,
        supermetaDaily,
        effectiveFrom,
      },
      select: {
        id: true,
        scopeType: true,
        scopeId: true,
        effectiveFrom: true,
        metaDaily: true,
        supermetaDaily: true,
      },
    });

    const metaMonth = Math.round(Number(metaDaily) * totalDays);
    const superMetaMonth = Math.round(Number(supermetaDaily) * totalDays);

    return {
      ...created,
      computed: {
        daysInMonth: totalDays,
        metaMonthly: metaMonth,
        supermetaMonthly: superMetaMonth,
        workdaysOnly: !!dto.workdaysOnly,
      },
    };
  }

  // ---------- helpers ----------

  private async sumStoreGoals(storeId: string, date: Date) {
    const sectors = await this.prisma.sector.findMany({
      where: { storeId },
      select: { id: true },
    });

    if (sectors.length === 0) {
      throw new BadRequestException(
        'Loja sem setores. Cadastre um setor antes de definir metas.',
      );
    }

    const policies = await this.prisma.goalPolicy.findMany({
      where: {
        scopeType: GoalScope.SECTOR,
        scopeId: { in: sectors.map((s) => s.id) },
        effectiveFrom: { lte: date },
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const latestBySector = new Map<string, (typeof policies)[number]>();
    for (const policy of policies) {
      if (!latestBySector.has(policy.scopeId)) {
        latestBySector.set(policy.scopeId, policy);
      }
    }

    let goal = 0;
    let superGoal = 0;
    let found = false;

    for (const sector of sectors) {
      const p = latestBySector.get(sector.id);
      if (!p) continue;
      const meta = Number(p.metaDaily ?? 0);
      const superMeta =
        p.supermetaDaily != null ? Number(p.supermetaDaily) : Math.ceil(meta * 1.3);
      goal += meta;
      superGoal += superMeta;
      found = true;
    }

    if (!found) return null;
    return { goal, superGoal };
  }

  private daysInclusive(start: Date, end: Date) {
    return Math.floor((+end - +start) / 86400000) + 1;
  }

  private daysInMonth(date: Date) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    return this.daysInclusive(start, end);
  }

  private countWorkdaysInclusive(start: Date, end: Date) {
    let c = 0, d = new Date(start);
    while (d <= end) {
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) c++;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return c;
  }

  /** <<< CORRIGIDO contra TS2367 >>> */
  private async resolveScope(user: JwtUser, q: GoalsEffectiveQueryDto) {
    this.ensureUser(user);
    const role = user.role as Role; // evita narrowing problemático

    // 1) funcionário
    if (q.employeeId) {
      if (role === Role.STORE_MANAGER) {
        const emp = await this.prisma.employee.findUnique({
          where: { id: q.employeeId },
          select: { storeId: true },
        });
        if (!emp || emp.storeId !== user.storeId) {
          throw new ForbiddenException('Funcionário fora do escopo da loja');
        }
      } else if (role === Role.CLIENT_ADMIN) {
        const emp = await this.prisma.employee.findUnique({
          where: { id: q.employeeId },
          select: { store: { select: { clientId: true } } },
        });
        if (!emp || emp.store.clientId !== user.clientId) {
          throw new ForbiddenException('Funcionário fora do escopo do cliente');
        }
      }
      return { scopeType: GoalScope.EMPLOYEE, scopeId: q.employeeId };
    }

    // 2) setor
    if (q.sectorId) {
      if (role === Role.STORE_MANAGER) {
        if (q.storeId && q.storeId !== user.storeId)
          throw new ForbiddenException('Setor fora do escopo da loja');
        const sec = await this.prisma.sector.findUnique({
          where: { id: q.sectorId },
          select: { storeId: true },
        });
        if (!sec || sec.storeId !== user.storeId)
          throw new ForbiddenException('Setor fora do escopo da loja');
      } else if (role === Role.CLIENT_ADMIN) {
        const sec = await this.prisma.sector.findUnique({
          where: { id: q.sectorId },
          select: { store: { select: { clientId: true } } },
        });
        if (!sec || sec.store.clientId !== user.clientId)
          throw new ForbiddenException('Setor fora do escopo do cliente');
      }
      return { scopeType: GoalScope.SECTOR, scopeId: q.sectorId };
    }

    // 3) loja
    if (q.storeId) {
      if (role === Role.STORE_MANAGER) {
        if (q.storeId !== user.storeId)
          throw new ForbiddenException('Loja fora do escopo do usuário');
      } else if (role === Role.CLIENT_ADMIN) {
        const store = await this.prisma.store.findUnique({
          where: { id: q.storeId },
          select: { clientId: true },
        });
        if (!store || store.clientId !== user.clientId)
          throw new ForbiddenException('Loja fora do escopo do cliente');
      }
      return { scopeType: GoalScope.STORE, scopeId: q.storeId };
    }

    // 3.1) fallback para gerente de loja
    if (role === Role.STORE_MANAGER) {
      if (!user.storeId) throw new ForbiddenException('Usuário de loja sem storeId associado');
      return { scopeType: GoalScope.STORE, scopeId: user.storeId };
    }

    // 4) cliente
    if (!q.clientId)
      throw new NotFoundException('Informe clientId, storeId, sectorId ou employeeId');

    if (role === Role.CLIENT_ADMIN && q.clientId !== user.clientId) {
      throw new ForbiddenException('Cliente fora do escopo do usuário');
    }

    return { scopeType: GoalScope.CLIENT, scopeId: q.clientId };
  }

  /** RBAC de criação com switch (sem TS2367) */
  private async assertCreateScope(user: JwtUser, scopeType: GoalScope, scopeId: string) {
    this.ensureUser(user);

    switch (user.role) {
      case Role.ADMIN:
        return;

      case Role.STORE_MANAGER: {
        if (scopeType === GoalScope.SECTOR) {
          const sec = await this.prisma.sector.findUnique({
            where: { id: scopeId },
            select: { storeId: true },
          });
          if (!sec || sec.storeId !== user.storeId)
            throw new ForbiddenException('Setor fora do escopo da loja');
          return;
        }
        if (scopeType === GoalScope.EMPLOYEE) {
          const emp = await this.prisma.employee.findUnique({
            where: { id: scopeId },
            select: { storeId: true },
          });
          if (!emp || emp.storeId !== user.storeId)
            throw new ForbiddenException('Funcionário fora do escopo da loja');
          return;
        }
        throw new ForbiddenException(
          'STORE_MANAGER só pode definir metas de SETOR ou EMPLOYEE da própria loja',
        );
      }

      case Role.CLIENT_ADMIN: {
        if (scopeType === GoalScope.CLIENT) {
          if (scopeId !== user.clientId)
            throw new ForbiddenException('Fora do escopo do cliente');
          return;
        }
        if (scopeType === GoalScope.STORE) {
          const s = await this.prisma.store.findUnique({
            where: { id: scopeId },
            select: { clientId: true },
          });
          if (!s || s.clientId !== user.clientId)
            throw new ForbiddenException('Loja fora do escopo do cliente');
          return;
        }
        if (scopeType === GoalScope.EMPLOYEE) {
          const e = await this.prisma.employee.findUnique({
            where: { id: scopeId },
            select: { store: { select: { clientId: true } } },
          });
          if (!e || e.store.clientId !== user.clientId)
            throw new ForbiddenException('Funcionário fora do escopo do cliente');
          return;
        }
        if (scopeType === GoalScope.SECTOR) {
          const sec = await this.prisma.sector.findUnique({
            where: { id: scopeId },
            select: { store: { select: { clientId: true } } },
          });
          if (!sec || sec.store.clientId !== user.clientId)
            throw new ForbiddenException('Setor fora do escopo do cliente');
          return;
        }
        break;
      }
    }

    throw new ForbiddenException('Seu papel não pode definir metas neste escopo');
  }
}
