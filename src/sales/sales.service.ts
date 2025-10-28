/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Sale } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import * as types from '../auth/types';
import { CreateSaleDto } from './dtos/create-sale.dto';
import { SalesListQueryDto } from './dtos/sales-list.query.dto';
import { SalesDailyQueryDto } from './dtos/sales-daily.query.dto';
// import SalesDailyScope from the correct location or fix the export in the DTO file
import { SalesDailyScope } from './dtos/sales-daily.query.dto'; // Ensure SalesDailyScope is exported in the DTO file
import { SalesSetDailyDto } from './dtos/sales-set-daily.dto';
import { GoalResolverService } from '../goals/goal-resolver.service';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalResolver: GoalResolverService,
  ) {}

  // ----------------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------------
  async list(user: types.JwtUser, q: SalesListQueryDto): Promise<Sale[]> {
    const where: Prisma.SaleWhereInput = {};

    if (user.role === 'ADMIN') {
      // sem filtro
    } else if (user.role === 'CLIENT_ADMIN') {
      where.clientId = user.clientId ?? undefined;
    } else if (user.role === 'STORE_MANAGER') {
      where.storeId = user.storeId ?? undefined;
    } else {
      throw new ForbiddenException();
    }

    if (q.clientId) where.clientId = q.clientId;
    if (q.storeId) where.storeId = q.storeId;
    if (q.employeeId) where.employeeId = q.employeeId;

    if (q.start || q.end) {
      const gte = q.start ? new Date(`${q.start}T00:00:00.000Z`) : undefined;
      const lte = q.end ? new Date(`${q.end}T00:00:00.000Z`) : undefined;
      where.saleDate = { gte, lte };
    }

    return this.prisma.sale.findMany({
      where,
      orderBy: [{ saleDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // ----------------------------------------------------------------------
  // CREATE (usa employeeId; infere storeId/clientId)
  // ----------------------------------------------------------------------
  async create(user: types.JwtUser, dto: CreateSaleDto): Promise<Sale> {
    if (!dto.employeeId) throw new BadRequestException('employeeId é obrigatório');
    if (!dto.saleDate) throw new BadRequestException('saleDate é obrigatório');
    if (dto.amount == null) throw new BadRequestException('amount é obrigatório');

    const saleDate = new Date(
      typeof dto.saleDate === 'string' ? `${dto.saleDate}T00:00:00.000Z` : dto.saleDate,
    );
    if (isNaN(saleDate.getTime())) throw new BadRequestException('Data inválida');

    const emp = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: { id: true, storeId: true, store: { select: { id: true, clientId: true } } },
    });
    if (!emp) throw new NotFoundException('Funcionário não encontrado');

    // RBAC
    if (user.role === 'ADMIN') {
      // ok
    } else if (user.role === 'CLIENT_ADMIN') {
      if (emp.store.clientId !== user.clientId) throw new ForbiddenException('Fora do seu escopo');
    } else if (user.role === 'STORE_MANAGER') {
      if (emp.storeId !== user.storeId) throw new ForbiddenException('Fora do seu escopo');
    } else {
      throw new ForbiddenException();
    }

    return this.prisma.sale.create({
      data: {
        clientId: emp.store.clientId,
        storeId: emp.storeId,
        employeeId: emp.id,
        saleDate,
        amount: dto.amount,
        itemsCount: dto.itemsCount ?? null,
        note: dto.note?.trim() || null,
        createdBy: user.id,
      },
    });
  }

  // ----------------------------------------------------------------------
  // DAILY (grade por dia; suporta SYSTEM/CLIENT/STORE/EMPLOYEE)
  // ----------------------------------------------------------------------
  async daily(user: types.JwtUser, q: SalesDailyQueryDto) {
    await this.assertDailyScope(user, q);

    const startISO = String(q.start);
    const endISO = String(q.end);
    const startD = new Date(`${startISO}T00:00:00.000Z`);
    const endD = new Date(`${endISO}T00:00:00.000Z`);
    if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
      throw new BadRequestException('Período inválido');
    }
    if (endD < startD) throw new BadRequestException('Fim anterior ao início');

    const days: string[] = [];
    for (let d = new Date(startD); d <= endD; d.setUTCDate(d.getUTCDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }
    const totalDays = days.length;
    const idx = new Map(days.map((d, i) => [d, i]));

    const where: Prisma.SaleWhereInput = { saleDate: { gte: startD, lte: endD } };
    let groupKey: 'clientId' | 'storeId' | 'employeeId';

    if (q.scope === SalesDailyScope.SYSTEM) {
      groupKey = 'clientId';
    } else if (q.scope === SalesDailyScope.CLIENT) {
      where.clientId = q.id;
      groupKey = 'storeId';
    } else if (q.scope === SalesDailyScope.STORE) {
      where.storeId = q.id;
      groupKey = 'employeeId';
    } else {
      where.employeeId = q.id;
      groupKey = 'employeeId';
    }

    const grouped = await this.prisma.sale.groupBy({
      by: ['saleDate', groupKey],
      where,
      _sum: { amount: true },
      orderBy: [{ saleDate: 'asc' }],
    });

    const series = new Map<string, number[]>();
    for (const g of grouped) {
      const dISO = new Date(g.saleDate as unknown as Date).toISOString().slice(0, 10);
      const gid = String((g as any)[groupKey]);
      if (!series.has(gid)) series.set(gid, Array(totalDays).fill(0));
      const i = idx.get(dISO);
      if (i !== undefined) series.get(gid)![i] += Number(g._sum.amount || 0);
    }

    let labels: Record<string, string> = {};
    const employeeContextById = new Map<
      string,
      { storeId: string; clientId: string; sectorId?: string | null; sectorName?: string | null }
    >();

    if (q.scope === SalesDailyScope.SYSTEM) {
      const clients = await this.prisma.client.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      labels = Object.fromEntries(clients.map((c) => [c.id, c.name]));
    } else if (q.scope === SalesDailyScope.CLIENT) {
      const stores = await this.prisma.store.findMany({
        where: { clientId: q.id, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      labels = Object.fromEntries(stores.map((s) => [s.id, s.name]));
    } else if (q.scope === SalesDailyScope.STORE) {
      const store = await this.prisma.store.findUnique({
        where: { id: q.id },
        select: { id: true, clientId: true },
      });
      if (!store) throw new BadRequestException('Loja não encontrada');
      const emps = await this.prisma.employee.findMany({
        where: { storeId: q.id, isActive: true },
        select: {
          id: true,
          fullName: true,
          sectorId: true,
          Sector: { select: { id: true, name: true } },
        },
        orderBy: { fullName: 'asc' },
      });
      labels = Object.fromEntries(emps.map((e) => [e.id, e.fullName]));
      for (const emp of emps) {
        employeeContextById.set(emp.id, {
          storeId: store.id,
          clientId: store.clientId,
          sectorId: emp.sectorId,
          sectorName: emp.Sector?.name ?? null,
        });
      }
    } else {
      if (!q.id) throw new BadRequestException('id é obrigatório quando scope=EMPLOYEE');
      const emp = await this.prisma.employee.findUnique({
        where: { id: q.id },
        select: {
          id: true,
          fullName: true,
          storeId: true,
          sectorId: true,
          store: { select: { id: true, clientId: true } },
          Sector: { select: { id: true, name: true } },
        },
      });
      if (emp) {
        labels[emp.id] = emp.fullName;
        employeeContextById.set(emp.id, {
          storeId: emp.storeId,
          clientId: emp.store.clientId,
          sectorId: emp.sectorId,
          sectorName: emp.Sector?.name ?? null,
        });
      }
    }

    for (const gid of Object.keys(labels)) {
      if (!series.has(gid)) series.set(gid, Array(totalDays).fill(0));
    }

    const metaForRow: Record<string, { metaDaily?: number; superDaily?: number }> = {};

    // ----------------------------------------------------------------------
    // RESOLUÇÃO DE METAS COM GOALRESOLVER
    // ----------------------------------------------------------------------
    if (q.scope === SalesDailyScope.STORE) {
      await Promise.all(
        Object.keys(labels).map(async (empId) => {
          const context = employeeContextById.get(empId);
          if (!context) {
            metaForRow[empId] = {};
            return;
          }

          const resolved = await this.goalResolver.resolve({
            clientId: context.clientId,
            storeId: context.storeId,
            sectorId: context.sectorId ?? undefined,
            employeeId: empId,
            date: startD,
          });

          if (resolved) {
            metaForRow[empId] = {
              metaDaily: resolved.goal,
              superDaily: resolved.superGoal,
            };
          } else {
            metaForRow[empId] = {};
          }
        }),
      );
    } else if (q.scope === SalesDailyScope.EMPLOYEE) {
      const empId = q.id!;
      let context = employeeContextById.get(empId);
      if (!context) {
        const emp = await this.prisma.employee.findUnique({
          where: { id: empId },
          select: {
            storeId: true,
            sectorId: true,
            store: { select: { id: true, clientId: true } },
            Sector: { select: { id: true, name: true } },
          },
        });
        if (emp) {
          context = {
            storeId: emp.storeId,
            clientId: emp.store.clientId,
            sectorId: emp.sectorId,
            sectorName: emp.Sector?.name ?? null,
          };
          employeeContextById.set(empId, context);
        }
      }

      if (context) {
        const resolved = await this.goalResolver.resolve({
          clientId: context.clientId,
          storeId: context.storeId,
          sectorId: context.sectorId ?? undefined,
          employeeId: empId,
          date: startD,
        });
        if (resolved) {
          metaForRow[empId] = {
            metaDaily: resolved.goal,
            superDaily: resolved.superGoal,
          };
        } else {
          metaForRow[empId] = {};
        }
      } else {
        metaForRow[empId] = {};
      }
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const end0 = new Date(endD);
    end0.setUTCHours(0, 0, 0, 0);
    const minRef = today.getTime() < end0.getTime() ? today : end0;
    let daysElapsed = Math.floor((minRef.getTime() - startD.getTime()) / 86_400_000) + 1;
    if (daysElapsed < 0) daysElapsed = 0;
    if (daysElapsed > totalDays) daysElapsed = totalDays;

    const groupIds = Object.keys(labels);
    const rows = groupIds.map((gid) => {
      const values = series.get(gid)!;
      const total = values.reduce((a, b) => a + (b || 0), 0);
      const { metaDaily, superDaily } = metaForRow[gid] || {};
      const metaMonth = metaDaily != null ? Math.round(metaDaily * totalDays) : undefined;
      const supermetaMonth = superDaily != null ? Math.round(superDaily * totalDays) : undefined;
      const context = employeeContextById.get(gid);

      const filled = values.slice(0, daysElapsed).filter((v) => v > 0);
      const filledSum = filled.reduce((a, b) => a + (b || 0), 0);
      const filledDays = filled.length;
      const avg = filledDays > 0 ? filledSum / filledDays : 0;
      const projection = Math.round(filledSum + avg * (totalDays - filledDays));

      return {
        id: gid,
        label: labels[gid] ?? gid,
        sectorId: context?.sectorId ?? null,
        sectorName: context?.sectorName ?? null,
        values,
        total,
        metaDaily,
        superDaily,
        metaMonth,
        supermetaMonth,
        projection,
      };
    });

    const totalsByDay = days.map((_, i) => rows.reduce((acc, r) => acc + (r.values[i] || 0), 0));
    const grandTotal = totalsByDay.reduce((a, b) => a + b, 0);

    return {
      period: { start: startISO, end: endISO, days: totalDays, daysElapsed },
      days,
      rows,
      totalsByDay,
      grandTotal,
    };
  }

  // ----------------------------------------------------------------------
  // setDaily (edição inline)
  // ----------------------------------------------------------------------
  async setDaily(user: types.JwtUser, dto: SalesSetDailyDto) {
    const saleDate = new Date(dto.saleDate + 'T00:00:00.000Z');
    if (isNaN(saleDate.getTime())) throw new BadRequestException('Data inválida');

    const emp = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: { id: true, storeId: true, store: { select: { id: true, clientId: true } } },
    });
    if (!emp) throw new NotFoundException('Funcionário não encontrado');

    // RBAC
    if (user.role === 'ADMIN') {
      // ok
    } else if (user.role === 'CLIENT_ADMIN') {
      if (emp.store.clientId !== user.clientId) throw new ForbiddenException('Fora do seu escopo');
    } else if (user.role === 'STORE_MANAGER') {
      if (emp.storeId !== user.storeId) throw new ForbiddenException('Fora do seu escopo');
    } else {
      throw new ForbiddenException();
    }

    const existing = await this.prisma.sale.findFirst({
      where: { employeeId: emp.id, saleDate },
      select: { id: true },
    });

    if (dto.amount <= 0) {
      if (existing) await this.prisma.sale.delete({ where: { id: existing.id } });
      return { ok: true, removed: true };
    }

    if (existing) {
      const updated = await this.prisma.sale.update({
        where: { id: existing.id },
        data: { amount: dto.amount },
        select: {
          id: true,
          employeeId: true,
          storeId: true,
          clientId: true,
          saleDate: true,
          amount: true,
        },
      });
      return { ok: true, sale: updated };
    } else {
      const created = await this.prisma.sale.create({
        data: {
          clientId: emp.store.clientId,
          storeId: emp.storeId,
          employeeId: emp.id,
          saleDate,
          amount: dto.amount,
          createdBy: user.id,
        },
        select: {
          id: true,
          employeeId: true,
          storeId: true,
          clientId: true,
          saleDate: true,
          amount: true,
        },
      });
      return { ok: true, sale: created };
    }
  }

  // ----------------------------------------------------------------------
  // RBAC helper
  // ----------------------------------------------------------------------
  private async assertDailyScope(user: types.JwtUser, q: SalesDailyQueryDto) {
    if (q.scope === SalesDailyScope.SYSTEM) {
      if (user.role !== 'ADMIN') throw new ForbiddenException();
      return;
    }

    if (user.role === 'ADMIN') {
      if (
        (q.scope === SalesDailyScope.CLIENT ||
          q.scope === SalesDailyScope.STORE ||
          q.scope === SalesDailyScope.EMPLOYEE) &&
        !q.id
      ) {
        throw new BadRequestException('id é obrigatório para esse escopo');
      }
      return;
    }

    if (q.scope === SalesDailyScope.CLIENT) {
      if (!q.id) throw new BadRequestException('id é obrigatório quando scope=CLIENT');
      if (user.role !== 'CLIENT_ADMIN') throw new ForbiddenException();
      if (user.clientId !== q.id) throw new ForbiddenException('Cliente fora do seu escopo');
      return;
    }

    if (q.scope === SalesDailyScope.STORE) {
      if (!q.id) throw new BadRequestException('id é obrigatório quando scope=STORE');
      const store = await this.prisma.store.findUnique({
        where: { id: q.id },
        select: { id: true, clientId: true },
      });
      if (!store) throw new ForbiddenException();
      if (user.role === 'CLIENT_ADMIN' && store.clientId !== user.clientId)
        throw new ForbiddenException();
      if (user.role === 'STORE_MANAGER' && store.id !== user.storeId)
        throw new ForbiddenException();
      return;
    }

    if (q.scope === SalesDailyScope.EMPLOYEE) {
      if (!q.id) throw new BadRequestException('id é obrigatório quando scope=EMPLOYEE');
      const emp = await this.prisma.employee.findUnique({
        where: { id: q.id },
        select: { store: { select: { id: true, clientId: true } } },
      });
      if (!emp) throw new ForbiddenException();
      if (user.role === 'CLIENT_ADMIN' && emp.store.clientId !== user.clientId)
        throw new ForbiddenException();
      if (user.role === 'STORE_MANAGER' && emp.store.id !== user.storeId)
        throw new ForbiddenException();
      return;
    }

    throw new ForbiddenException();
  }
}
