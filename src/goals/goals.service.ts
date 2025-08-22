/* eslint-disable prettier/prettier */
// src/goals/goals.service.ts
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateGoalDto } from './dtos/create-goal.dto';
import { JwtUser } from '../auth/types';
import { GoalScope, Prisma } from '@prisma/client';

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: JwtUser, dto: CreateGoalDto) {
    if (user.role === 'STORE_MANAGER') throw new ForbiddenException('Sem permissão');

    if (user.role === 'CLIENT_ADMIN') {
      if (!user.clientId) throw new ForbiddenException('Token sem clientId');
      if (dto.scopeType === GoalScope.CLIENT) {
        if (dto.scopeId !== user.clientId) throw new ForbiddenException('Outro cliente');
      } else if (dto.scopeType === GoalScope.STORE) {
        const store = await this.prisma.store.findUnique({ where: { id: dto.scopeId } });
        if (!store || store.clientId !== user.clientId) throw new ForbiddenException('Loja fora do cliente');
      } else if (dto.scopeType === GoalScope.EMPLOYEE) {
        const emp = await this.prisma.employee.findUnique({ where: { id: dto.scopeId }, include: { store: true } });
        if (!emp || emp.store.clientId !== user.clientId) throw new ForbiddenException('Funcionário fora do cliente');
      }
    }

    if (dto.scopeType === GoalScope.CLIENT) {
      const client = await this.prisma.client.findUnique({ where: { id: dto.scopeId } });
      if (!client) throw new BadRequestException('Cliente inexistente');
    } else if (dto.scopeType === GoalScope.STORE) {
      const store = await this.prisma.store.findUnique({ where: { id: dto.scopeId } });
      if (!store) throw new BadRequestException('Loja inexistente');
    } else {
      const emp = await this.prisma.employee.findUnique({ where: { id: dto.scopeId } });
      if (!emp) throw new BadRequestException('Funcionário inexistente');
    }

    const meta = new Prisma.Decimal(dto.metaDaily);
    const supermetaCalc = dto.supermetaDaily ?? Math.round(Number(meta) * 1.3 * 100) / 100;
    const supermeta = new Prisma.Decimal(supermetaCalc);

    const created = await this.prisma.goalPolicy.create({
      data: {
        scopeType: dto.scopeType,
        scopeId: dto.scopeId,
        metaDaily: meta,
        supermetaDaily: supermeta, // <-- sempre um valor, nunca null
        effectiveFrom: new Date(dto.effectiveFrom),
        createdBy: user.sub ?? null,
      },
    });

    return created;
  }

  async list(user: JwtUser, scopeType: GoalScope, scopeId: string) {
    if (user.role === 'STORE_MANAGER') throw new ForbiddenException('Sem permissão');

    if (user.role === 'CLIENT_ADMIN') {
      if (!user.clientId) throw new ForbiddenException('Token sem clientId');
      if (scopeType === GoalScope.CLIENT && scopeId !== user.clientId) {
        throw new ForbiddenException('Outro cliente');
      }
      if (scopeType === GoalScope.STORE) {
        const store = await this.prisma.store.findUnique({ where: { id: scopeId } });
        if (!store || store.clientId !== user.clientId) throw new ForbiddenException('Loja fora do cliente');
      }
      if (scopeType === GoalScope.EMPLOYEE) {
        const emp = await this.prisma.employee.findUnique({ where: { id: scopeId }, include: { store: true } });
        if (!emp || emp.store.clientId !== user.clientId) throw new ForbiddenException('Funcionário fora do cliente');
      }
    }

    return this.prisma.goalPolicy.findMany({
      where: { scopeType, scopeId },
      orderBy: { effectiveFrom: 'desc' },
    });
  }
}
