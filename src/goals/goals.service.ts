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
import * as types from '../auth/types';
import { GoalScope } from '@prisma/client';
import { GoalsEffectiveQueryDto } from './dtos/goals-effective.query.dto';
import { CreateGoalDto } from './dtos/create-goal.dto';

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna a meta diária e a super meta diária vigentes na data/escopo.
   * - employeeId > storeId > clientId
   */
  async effective(user: types.JwtUser, q: GoalsEffectiveQueryDto) {
    const dateStr = q.date ?? new Date().toISOString().slice(0, 10);

    const { scopeType, scopeId } = await this.resolveScope(user, q);

    const policy = await this.prisma.goalPolicy.findFirst({
      where: {
        scopeType,
        scopeId,
        effectiveFrom: { lte: new Date(dateStr + 'T00:00:00.000Z') },
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
        period: { start: undefined, end: dateStr },
      };
    }

    return {
      scopeType,
      scopeId,
      goal: Number(policy.metaDaily),
      superGoal: Number(policy.supermetaDaily),
      period: {
        start: policy.effectiveFrom.toISOString().slice(0, 10),
        end: dateStr,
      },
    };
  }

  /**
   * Cria/atualiza política de meta.
   * - Aceita meta diária OU mensal; se vier mensal, converte para diária.
   * - Se não vier super meta, calcula automaticamente por percentual (padrão 30%).
   * - Pode dividir por dias úteis se `workdaysOnly=true`.
   */
  async create(user: types.JwtUser, dto: CreateGoalDto) {
    await this.assertCreateScope(user, dto.scopeType, dto.scopeId);

    const effectiveFrom = new Date(dto.effectiveFrom + 'T00:00:00.000Z');
    if (Number.isNaN(+effectiveFrom)) {
      throw new BadRequestException('effectiveFrom inválido (YYYY-MM-DD)');
    }

    // utilitários de dias
    const monthStart = new Date(Date.UTC(effectiveFrom.getUTCFullYear(), effectiveFrom.getUTCMonth(), 1));
    const monthEnd   = new Date(Date.UTC(effectiveFrom.getUTCFullYear(), effectiveFrom.getUTCMonth() + 1, 0));
    const totalDays  = dto.workdaysOnly ? this.countWorkdaysInclusive(monthStart, monthEnd) : this.daysInclusive(monthStart, monthEnd);

    // meta diária
    let metaDaily = dto.metaDaily;
    if (metaDaily === undefined) {
      if (dto.metaMonthly === undefined) {
        throw new BadRequestException('Informe metaDaily OU metaMonthly');
      }
      metaDaily = Math.ceil(Number(dto.metaMonthly) / Math.max(totalDays, 1));
    }

    // super meta diária
    let supermetaDaily = dto.supermetaDaily;
    if (supermetaDaily === undefined) {
      if (dto.supermetaMonthly !== undefined) {
        supermetaDaily = Math.ceil(Number(dto.supermetaMonthly) / Math.max(totalDays, 1));
      } else {
        const superPercent = dto.superPercent ?? 30; // default 30%
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
        createdBy: (user as any)?.id ?? null,
      },
      select: {
        id: true, scopeType: true, scopeId: true, effectiveFrom: true,
        metaDaily: true, supermetaDaily: true,
      },
    });

    const metaMonth      = Math.round(Number(metaDaily)      * totalDays);
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

  private daysInclusive(start: Date, end: Date) {
    return Math.floor((+end - +start) / 86400000) + 1;
  }
  private countWorkdaysInclusive(start: Date, end: Date) {
    let c = 0, d = new Date(start);
    while (d <= end) {
      const wd = d.getUTCDay(); // 0..6 (dom..sáb)
      if (wd !== 0 && wd !== 6) c++;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return c;
  }

  /** Valida/resolve escopo do effective() e aplica RBAC */
  private async resolveScope(user: types.JwtUser, q: GoalsEffectiveQueryDto) {
    if (q.employeeId) {
      if (user.role === 'STORE_MANAGER') {
        const emp = await this.prisma.employee.findUnique({
          where: { id: q.employeeId },
          select: { storeId: true },
        });
        if (!emp || emp.storeId !== user.storeId) {
          throw new ForbiddenException('Funcionário fora do escopo da loja');
        }
      } else if (user.role === 'CLIENT_ADMIN') {
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

        if (q.sectorId) {
      if (user.role === 'STORE_MANAGER') {
        if (q.storeId && q.storeId !== user.storeId) throw new ForbiddenException('Setor fora do escopo da loja');
        const sec = await this.prisma.sector.findUnique({
          where: { id: q.sectorId },
          select: { storeId: true },
        });
        if (!sec || sec.storeId !== user.storeId) throw new ForbiddenException('Setor fora do escopo da loja');
      } else if (user.role === 'CLIENT_ADMIN') {
        const sec = await this.prisma.sector.findUnique({
          where: { id: q.sectorId },
          select: { store: { select: { clientId: true } } },
        });
        if (!sec || sec.store.clientId !== user.clientId)
          throw new ForbiddenException('Setor fora do escopo do cliente');
      }
      return { scopeType: GoalScope.SECTOR, scopeId: q.sectorId };
    }

    if (q.storeId) {
      if (user.role === 'STORE_MANAGER') {
        if (q.storeId !== user.storeId) throw new ForbiddenException('Loja fora do escopo do usuário');
      } else if (user.role === 'CLIENT_ADMIN') {
        const store = await this.prisma.store.findUnique({
          where: { id: q.storeId },
          select: { clientId: true },
        });
        if (!store || store.clientId !== user.clientId) throw new ForbiddenException('Loja fora do escopo do cliente');
      }
      return { scopeType: GoalScope.STORE, scopeId: q.storeId };
    }

    if (!q.clientId) throw new NotFoundException('Informe clientId, storeId, sectorId ou employeeId');
    if (user.role === 'CLIENT_ADMIN' && q.clientId !== user.clientId) {
      throw new ForbiddenException('Cliente fora do escopo do usuário');
    }
    if (user.role === 'STORE_MANAGER') {
      throw new ForbiddenException('STORE_MANAGER não pode consultar por clientId');
    }

    return { scopeType: GoalScope.CLIENT, scopeId: q.clientId };
  }

  /** RBAC para criação de metas (CLIENT_ADMIN só dentro do próprio cliente) */
  private async assertCreateScope(user: types.JwtUser, scopeType: GoalScope, scopeId: string) {
    if (user.role === 'ADMIN') return;

    if (user.role === 'CLIENT_ADMIN') {
      if (scopeType === 'CLIENT') {
        if (scopeId !== user.clientId) throw new ForbiddenException('Fora do escopo do cliente');
        return;
      }
      if (scopeType === 'STORE') {
        const s = await this.prisma.store.findUnique({ where: { id: scopeId }, select: { clientId: true } });
        if (!s || s.clientId !== user.clientId) throw new ForbiddenException('Loja fora do escopo do cliente');
        return;
      }
      if (scopeType === 'EMPLOYEE') {
        const e = await this.prisma.employee.findUnique({
          where: { id: scopeId },
          select: { store: { select: { clientId: true } } },
        });
        if (!e || e.store.clientId !== user.clientId) throw new ForbiddenException('Funcionário fora do escopo do cliente');
        return;
      }
            if (scopeType === 'SECTOR') {
         const sec = await this.prisma.sector.findUnique({
           where: { id: scopeId },
           select: { store: { select: { clientId: true } } },
         });
         if (!sec || sec.store.clientId !== user.clientId)
           throw new ForbiddenException('Setor fora do escopo do cliente');
         return;
      }
    }

    throw new ForbiddenException('Seu papel não pode definir metas neste escopo');
  }
}
