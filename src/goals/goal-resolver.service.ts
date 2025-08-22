/* eslint-disable prettier/prettier */
// src/goals/goal-resolver.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { GoalScope, Prisma } from '@prisma/client';

@Injectable()
export class GoalResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(params: {
    clientId: string;
    storeId?: string;
    employeeId?: string;
    date: Date;
  }): Promise<{ goal: number; superGoal: number } | null> {
    const { clientId, storeId, employeeId, date } = params;

    const or: Prisma.GoalPolicyWhereInput[] = [
      { scopeType: GoalScope.CLIENT, scopeId: clientId },
    ];
    if (storeId) or.push({ scopeType: GoalScope.STORE, scopeId: storeId });
    if (employeeId) or.push({ scopeType: GoalScope.EMPLOYEE, scopeId: employeeId });

    const policies = await this.prisma.goalPolicy.findMany({
      where: { effectiveFrom: { lte: date }, OR: or },
      orderBy: { effectiveFrom: 'desc' },
    });

    const by = (t: GoalScope) => policies.find(p => p.scopeType === t);
    const chosen = by(GoalScope.EMPLOYEE) ?? by(GoalScope.STORE) ?? by(GoalScope.CLIENT);
    if (!chosen) return null;

    // metaDaily/supermetaDaily são Decimal; converta para number
    const goal = Number(chosen.metaDaily);
    const superGoal =
      chosen.supermetaDaily !== null && chosen.supermetaDaily !== undefined
        ? Number(chosen.supermetaDaily)
        : Math.round(goal * 1.3 * 100) / 100; // fallback 30% com 2 casas

    return { goal, superGoal };
  }
}
