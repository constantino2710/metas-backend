/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { JwtUser } from '../auth/types';

type ResolveInput = {
  clientId?: string;
  storeId?: string;
  sectorId?: string;
  employeeId?: string;
  date: Date;
};

@Injectable()
export class GoalResolverService {
  constructor(private readonly goals: GoalsService) {}

  /**
   * Retorna a meta efetiva do dia para o contexto (employee > sector > store > client).
   */
  async resolve(
    ctx: ResolveInput,
  ): Promise<{ goal?: number; superGoal?: number } | undefined> {
    // Usuário interno para resolução (sem RBAC restringindo)
    const systemUser: JwtUser = {
      id: 'system',
      role: 'ADMIN' as any,
      clientId: null,
      storeId: null,
    };

    const q: any = {
      date: ctx.date.toISOString().slice(0, 10),
      clientId: ctx.clientId,
      storeId: ctx.storeId,
      sectorId: ctx.sectorId,
      employeeId: ctx.employeeId,
    };

    const res = await this.goals.effective(systemUser, q);
    if (!res) return undefined;
    return { goal: res.metaDaily, superGoal: res.superDaily };
  }
}
