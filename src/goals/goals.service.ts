/* eslint-disable prettier/prettier */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { GoalsEffectiveQueryDto } from './dtos/goals-effective.query.dto';
import * as types from '../auth/types';
import { GoalScope } from '@prisma/client';

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna meta diária e supermeta diária vigentes no dia/escopo.
   * - Se employeeId informado -> escopo EMPLOYEE
   * - Senão, se storeId informado -> escopo STORE
   * - Senão, usa clientId -> escopo CLIENT
   */
  async effective(user: types.JwtUser, q: GoalsEffectiveQueryDto) {
    const dateStr = q.date ?? new Date().toISOString().slice(0, 10);

    // Resolve escopo
    const { scopeType, scopeId } = await this.resolveScope(user, q);

    // Busca policy mais recente ≤ date
    const policy = await this.prisma.goalPolicy.findFirst({
      where: {
        scopeType,
        scopeId,
        effectiveFrom: { lte: new Date(dateStr + 'T00:00:00.000Z') },
      },
      orderBy: { effectiveFrom: 'desc' },
      select: {
        metaDaily: true,
        supermetaDaily: true,
        effectiveFrom: true,
      },
    });

    if (!policy) {
      // Não há meta para este escopo/data; retorna estrutura neutra
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
   * Valida/resolve escopo e aplica RBAC:
   * ADMIN: qualquer escopo
   * CLIENT_ADMIN: somente clientId === user.clientId; store/employee precisam pertencer ao mesmo client
   * STORE_MANAGER: somente sua store; employee precisa pertencer à sua store; clientId não permitido
   */
  private async resolveScope(user: types.JwtUser, q: GoalsEffectiveQueryDto) {
    // Determina prioridade: employee > store > client
    if (q.employeeId) {
      // RBAC
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

    if (q.storeId) {
      if (user.role === 'STORE_MANAGER') {
        if (q.storeId !== user.storeId) {
          throw new ForbiddenException('Loja fora do escopo do usuário');
        }
      } else if (user.role === 'CLIENT_ADMIN') {
        const store = await this.prisma.store.findUnique({
          where: { id: q.storeId },
          select: { clientId: true },
        });
        if (!store || store.clientId !== user.clientId) {
          throw new ForbiddenException('Loja fora do escopo do cliente');
        }
      }

      return { scopeType: GoalScope.STORE, scopeId: q.storeId };
    }

    // clientId obrigatório se não vier store/employee
    if (!q.clientId) {
      throw new NotFoundException('Informe clientId, storeId ou employeeId');
    }

    if (user.role === 'CLIENT_ADMIN' && q.clientId !== user.clientId) {
      throw new ForbiddenException('Cliente fora do escopo do usuário');
    }
    if (user.role === 'STORE_MANAGER') {
      throw new ForbiddenException('STORE_MANAGER não pode consultar por clientId');
    }

    return { scopeType: GoalScope.CLIENT, scopeId: q.clientId };
  }
}
