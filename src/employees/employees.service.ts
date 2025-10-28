/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateEmployeeDto } from './dtos/create-employee.dto';
import { UpdateEmployeeDto } from './dtos/update-employee.dto';
import { EmployeesListQueryDto } from './dtos/employees-list.query.dto';
import { JwtUser, Role } from '../auth/types';
import { Prisma } from '@prisma/client';

/** Monta um WHERE escopado sem introduzir valores nulos em filtros do Prisma */
function scopeEmployeesWhere(
  user: JwtUser,
  base: Prisma.EmployeeWhereInput = {},
): Prisma.EmployeeWhereInput {
  // ADMIN vê tudo
  if (user.role === Role.ADMIN) return base;

  const clauses: Prisma.EmployeeWhereInput[] = [base];

  if (user.role === Role.CLIENT_ADMIN && user.clientId) {
    // funcionário pertence a lojas do cliente do usuário
    clauses.push({ store: { clientId: user.clientId } });
  }

  if (user.role === Role.STORE_MANAGER && user.storeId) {
    // funcionário pertence à loja do gerente
    clauses.push({ storeId: user.storeId });
  }

  // Se só havia a cláusula base, devolvemos base; senão AND com todas
  return clauses.length === 1 ? base : { AND: clauses };
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: JwtUser, q: EmployeesListQueryDto) {
    const where: Prisma.EmployeeWhereInput = {};

    // filtros opcionais
    if (q.storeId) where.storeId = q.storeId;
    if (q.clientId) where.store = { clientId: q.clientId };
    if (q.search) where.fullName = { contains: q.search, mode: 'insensitive' };

    const scoped = scopeEmployeesWhere(user, where);

    return this.prisma.employee.findMany({
      where: scoped,
      orderBy: [{ fullName: 'asc' }],
      include: {
        store: { select: { id: true, name: true, clientId: true } },
        Sector: { select: { id: true, name: true } }, // mantém a relação como já usada no seu schema
      },
    });
  }

  async create(user: JwtUser, dto: CreateEmployeeDto) {
    // Resolver storeId final conforme papel
    let storeId: string | undefined;

    if (user.role === Role.STORE_MANAGER) {
      if (!user.storeId) throw new ForbiddenException('Token sem storeId');
      storeId = user.storeId; // ignora dto.storeId
    } else if (user.role === Role.CLIENT_ADMIN) {
      if (!dto.storeId) throw new BadRequestException('storeId é obrigatório');
      const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
      if (!store) throw new BadRequestException('Loja inexistente');
      if (store.clientId !== user.clientId)
        throw new ForbiddenException('Loja fora do seu cliente');
      storeId = store.id;
    } else {
      // ADMIN
      if (!dto.storeId) throw new BadRequestException('storeId é obrigatório');
      const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
      if (!store) throw new BadRequestException('Loja inexistente');
      storeId = store.id;
    }

    if (!dto.sectorId) throw new BadRequestException('sectorId é obrigatório');
    const sector = await this.prisma.sector.findUnique({ where: { id: dto.sectorId } });
    if (!sector) throw new BadRequestException('Setor inexistente');
    if (sector.storeId !== storeId)
      throw new BadRequestException('Setor não pertence à loja');

    const data: Prisma.EmployeeCreateInput = {
      fullName: dto.fullName.trim(),
      store: { connect: { id: storeId! } },
    };
    if (dto.sectorId) data.Sector = { connect: { id: dto.sectorId } };

    return this.prisma.employee.create({
      data,
      include: { Sector: { select: { id: true, name: true } } },
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
    if (user.role === Role.STORE_MANAGER && dto.storeId && dto.storeId !== emp.storeId) {
      throw new ForbiddenException('Store Manager não pode mover funcionário entre lojas');
    }

    // CLIENT_ADMIN só pode mover para loja do próprio cliente
    if (user.role === Role.CLIENT_ADMIN && dto.storeId && dto.storeId !== emp.storeId) {
      const target = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
      if (!target) throw new BadRequestException('Loja destino inexistente');
      if (target.clientId !== user.clientId)
        throw new ForbiddenException('Loja destino fora do seu cliente');
    }

    const data: Prisma.EmployeeUpdateInput = {};
    let targetStoreId = emp.storeId;

    if (dto.fullName) data.fullName = dto.fullName.trim();

    if (dto.storeId && user.role !== Role.STORE_MANAGER) {
      data.store = { connect: { id: dto.storeId } };
      targetStoreId = dto.storeId;
    }

    if (dto.sectorId) {
      const sector = await this.prisma.sector.findUnique({ where: { id: dto.sectorId } });
      if (!sector) throw new BadRequestException('Setor inexistente');
      if (sector.storeId !== targetStoreId)
        throw new BadRequestException('Setor não pertence à loja');
      data.Sector = { connect: { id: dto.sectorId } };
    }

    return this.prisma.employee.update({
      where: { id },
      data,
      include: { Sector: { select: { id: true, name: true } } },
    });
  }
}
