/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
// src/goals/goal-resolver.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { GoalScope, Prisma } from '@prisma/client';

@Injectable()
export class GoalResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(params: {
    clientId: string;
    storeId?: string;
    sectorId?: string;
    employeeId?: string;
    date: Date;
  }): Promise<{ goal: number; superGoal: number } | null> {
    const { clientId, storeId, sectorId, employeeId, date } = params;

    // Caso seja uma loja sem escopo menor, soma metas dos setores
    if (storeId && !sectorId && !employeeId) {
      const { goal, superGoal } = await this.sumStoreGoals(storeId, date);
      return { goal, superGoal };
    }

    const or: Prisma.GoalPolicyWhereInput[] = [
      { scopeType: GoalScope.CLIENT, scopeId: clientId },
    ];
    if (employeeId) or.push({ scopeType: GoalScope.EMPLOYEE, scopeId: employeeId });
    if (sectorId) or.push({ scopeType: GoalScope.SECTOR, scopeId: sectorId });

    const policies = await this.prisma.goalPolicy.findMany({
      where: { effectiveFrom: { lte: date }, OR: or },
      orderBy: { effectiveFrom: 'desc' },
    });

    const by = (t: GoalScope) => policies.find(p => p.scopeType === t);
    const chosen =
      by(GoalScope.EMPLOYEE) ??
      by(GoalScope.SECTOR) ??
      by(GoalScope.CLIENT);

    if (!chosen) return null;

    const goal = Number(chosen.metaDaily);
    const superGoal =
      chosen.supermetaDaily !== null && chosen.supermetaDaily !== undefined
        ? Number(chosen.supermetaDaily)
        : Math.round(goal * 1.3 * 100) / 100; // fallback 30% com 2 casas

    return { goal, superGoal };
  }

  private async sumStoreGoals(storeId: string, date: Date) {
    const sectors = await this.prisma.sector.findMany({
      where: { storeId, isActive: true },
      select: { id: true },
    });

    if (sectors.length === 0) {
      throw new BadRequestException('Loja sem setores. Cadastre um setor antes de definir metas.');
    }

    const policies = await this.prisma.goalPolicy.findMany({
      where: {
        scopeType: GoalScope.SECTOR,
        scopeId: { in: sectors.map(s => s.id) },
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

    for (const sector of sectors) {
      const p = latestBySector.get(sector.id);
      if (!p) continue;

      const meta = Number(p.metaDaily ?? 0);
      const superMeta = p.supermetaDaily != null ? Number(p.supermetaDaily) : Math.ceil(meta * 1.3);

      goal += meta;
      superGoal += superMeta;
    }

    return { goal, superGoal };
  }
}
