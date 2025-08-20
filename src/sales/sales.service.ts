/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JwtUser } from '../auth/types';
import { applyScope } from '../common/utils/scope.util';
import { Sale } from '@prisma/client';
import { CreateSaleDto } from './dtos/create-sale.dto';
import { SalesListQueryDto } from './dtos/sales-list.query.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: JwtUser, filters: SalesListQueryDto): Promise<Sale[]> {
    const where: any = {};
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.storeId) where.storeId = filters.storeId;
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.start || filters.end) {
      where.saleDate = {};
      if (filters.start) where.saleDate.gte = new Date(filters.start);
      if (filters.end) where.saleDate.lte = new Date(filters.end);
    }
    const scopedWhere = applyScope(user, where);
    return this.prisma.sale.findMany({ where: scopedWhere, orderBy: { saleDate: 'asc' } });
  }

  async create(user: JwtUser, dto: CreateSaleDto): Promise<Sale> {
    // segurança: employeeId precisa estar no seu escopo
    const emp = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!emp) throw new ForbiddenException('Employee not found');

    if (user.role === 'STORE_MANAGER' && emp.storeId !== user.storeId) {
      throw new ForbiddenException('Employee outside your store');
    }
    if (user.role === 'CLIENT_ADMIN') {
      const store = await this.prisma.store.findUnique({ where: { id: emp.storeId } });
      if (!store || store.clientId !== user.clientId) throw new ForbiddenException('Employee outside your client');
    }

    const store = await this.prisma.store.findUnique({ where: { id: emp.storeId } });
    const clientId = store!.clientId;

    return this.prisma.sale.create({
      data: {
        employeeId: dto.employeeId,
        storeId: emp.storeId,
        clientId,
        saleDate: new Date(dto.saleDate),
        amount: dto.amount,
        itemsCount: dto.itemsCount,
        note: dto.note,
        createdBy: user.sub,
      },
    });
  }
}
