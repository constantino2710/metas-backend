/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable prettier/prettier */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateEmployeeDto } from './dtos/create-employee.dto';
import { UpdateEmployeeDto } from './dtos/update-employee.dto';
import { EmployeesListQueryDto } from './dtos/employees-list.query.dto';
import { JwtUser } from '../auth/types';
import { Prisma } from '@prisma/client';

function scopeEmployeesWhere(user: JwtUser, where: Prisma.EmployeeWhereInput = {}): Prisma.EmployeeWhereInput {
  if (user.role === 'ADMIN') return where;

  if (user.role === 'CLIENT_ADMIN') {
    // funcionário pertence a lojas do cliente do usuário
    return { AND: [ where, { store: { clientId: user.clientId } } ] };
  }

  // STORE_MANAGER
  return { AND: [ where, { storeId: user.storeId } ] };
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: JwtUser, q: EmployeesListQueryDto) {
    const where: Prisma.EmployeeWhereInput = {};

    if (q.storeId) where.storeId = q.storeId;
    if (q.clientId) where.store = { clientId: q.clientId };
    if (q.search) where.fullName = { contains: q.search, mode: 'insensitive' };

    const scoped = scopeEmployeesWhere(user, where);

    return this.prisma.employee.findMany({
      where: scoped,
      orderBy: [{ fullName: 'asc' }],
      include: { store: { select: { id: true, name: true, clientId: true } } },
    });
  }

  async create(user: JwtUser, dto: CreateEmployeeDto) {
    // Resolver storeId final conforme papel
    let storeId: string | undefined;

    if (user.role === 'STORE_MANAGER') {
      if (!user.storeId) throw new ForbiddenException('Token sem storeId');
      storeId = user.storeId; // ignora dto.storeId
    } else if (user.role === 'CLIENT_ADMIN') {
      if (!dto.storeId) throw new BadRequestException('storeId é obrigatório');
      const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
      if (!store) throw new BadRequestException('Loja inexistente');
      if (store.clientId !== user.clientId) throw new ForbiddenException('Loja fora do seu cliente');
      storeId = store.id;
    } else {
      // ADMIN
      if (!dto.storeId) throw new BadRequestException('storeId é obrigatório');
      const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
      if (!store) throw new BadRequestException('Loja inexistente');
      storeId = store.id;
    }

    return this.prisma.employee.create({
      data: { fullName: dto.fullName.trim(), storeId: storeId! },
    });
  }

  async update(user: JwtUser, id: string, dto: UpdateEmployeeDto) {
    const emp = await this.prisma.employee.findUnique({
      where: { id },
      include: { store: { select: { id: true, clientId: true } } },
    });
    if (!emp) throw new NotFoundException('Funcionário não encontrado');

    // Checagem de escopo de leitura
    const canSee = await this.prisma.employee.findFirst({
      where: scopeEmployeesWhere(user, { id }),
      select: { id: true },
    });
    if (!canSee) throw new ForbiddenException('Fora do seu escopo');

    // STORE_MANAGER não pode mover de loja
    if (user.role === 'STORE_MANAGER' && dto.storeId && dto.storeId !== emp.storeId) {
      throw new ForbiddenException('Store Manager não pode mover funcionário entre lojas');
    }

    // CLIENT_ADMIN só pode mover para loja do próprio cliente
    if (user.role === 'CLIENT_ADMIN' && dto.storeId && dto.storeId !== emp.storeId) {
      const target = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
      if (!target) throw new BadRequestException('Loja destino inexistente');
      if (target.clientId !== user.clientId) throw new ForbiddenException('Loja destino fora do seu cliente');
    }

    return this.prisma.employee.update({
      where: { id },
      data: {
        fullName: dto.fullName?.trim(),
        storeId: dto.storeId, // só ADMIN/CLIENT_ADMIN efetivamente conseguem alterar
      },
    });
  }
}
