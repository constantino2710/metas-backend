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
import { SalesDailyQueryDto, SalesDailyScope } from './dtos/sales-daily.query.dto';
import { SalesSetDailyDto } from './dtos/sales-set-daily.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

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

    // eixo de dias
    const days: string[] = [];
    for (let d = new Date(startD); d <= endD; d.setUTCDate(d.getUTCDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }
    const totalDays = days.length;
    const idx = new Map(days.map((d, i) => [d, i]));

    // filtro base e chave de agrupamento
    const where: Prisma.SaleWhereInput = { saleDate: { gte: startD, lte: endD } };
    let groupKey: 'clientId' | 'storeId' | 'employeeId';

    if (q.scope === SalesDailyScope.SYSTEM) {
      groupKey = 'clientId'; // 1 linha por cliente
    } else if (q.scope === SalesDailyScope.CLIENT) {
      where.clientId = q.id;
      groupKey = 'storeId'; // 1 linha por loja
    } else if (q.scope === SalesDailyScope.STORE) {
      where.storeId = q.id;
      groupKey = 'employeeId'; // 1 linha por funcionário
    } else {
      where.employeeId = q.id;
      groupKey = 'employeeId'; // 1 linha (funcionário)
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

    // labels e auxiliares
    let labels: Record<string, string> = {};
    const empStoreByEmpId = new Map<string, { storeId: string }>();

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
      const emps = await this.prisma.employee.findMany({
        where: { storeId: q.id, isActive: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      });
      labels = Object.fromEntries(emps.map((e) => [e.id, e.fullName]));
    } else {
      // EMPLOYEE – garantir id
      if (!q.id) throw new BadRequestException('id é obrigatório quando scope=EMPLOYEE');
      const emp = await this.prisma.employee.findUnique({
        where: { id: q.id },
        select: { id: true, fullName: true, storeId: true },
      });
      if (emp) {
        labels[emp.id] = emp.fullName;
        empStoreByEmpId.set(emp.id, { storeId: emp.storeId });
      }
    }

    // assegura linhas zeradas
    for (const gid of Object.keys(labels)) {
      if (!series.has(gid)) series.set(gid, Array(totalDays).fill(0));
    }

    // ---------------- METAS
    const metaForRow: Record<string, { metaDaily?: number; superDaily?: number }> = {};

    if (q.scope === SalesDailyScope.SYSTEM) {
      // soma das metas diárias das LOJAS de cada cliente
      const clientIds = Object.keys(labels);
      if (clientIds.length) {
        const stores = await this.prisma.store.findMany({
          where: { clientId: { in: clientIds }, isActive: true },
          select: { id: true, clientId: true },
        });
        const storeIds = stores.map((s) => s.id);
        const storeIdsByClient: Record<string, string[]> = {};
        for (const s of stores) {
          (storeIdsByClient[s.clientId] ??= []).push(s.id);
        }

        if (storeIds.length) {
          const policies = await this.prisma.goalPolicy.findMany({
            where: { scopeType: 'STORE', scopeId: { in: storeIds }, effectiveFrom: { lte: startD } },
            orderBy: [{ scopeId: 'asc' }, { effectiveFrom: 'desc' }],
          });
          const bestPerStore = new Map<string, { meta: number; superm: number }>();
          for (const p of policies) {
            const sid = p.scopeId;
            if (!bestPerStore.has(sid)) {
              bestPerStore.set(sid, {
                meta: Number(p.metaDaily),
                superm: Number(p.supermetaDaily),
              });
            }
          }
          for (const cid of clientIds) {
            let m = 0,
              s = 0,
              any = false;
            for (const sid of storeIdsByClient[cid] || []) {
              const b = bestPerStore.get(sid);
              if (b) {
                m += b.meta;
                s += b.superm;
                any = true;
              }
            }
            metaForRow[cid] = any ? { metaDaily: m, superDaily: s } : {};
          }
        }
      }
    } else if (q.scope === SalesDailyScope.CLIENT) {
      const storeIds = Object.keys(labels);
      if (storeIds.length) {
        const policies = await this.prisma.goalPolicy.findMany({
          where: { scopeType: 'STORE', scopeId: { in: storeIds }, effectiveFrom: { lte: startD } },
          orderBy: [{ scopeId: 'asc' }, { effectiveFrom: 'desc' }],
        });
        const best: Record<string, { meta: number; superm: number }> = {};
        for (const p of policies) {
          const sid = p.scopeId;
          if (!best[sid]) best[sid] = { meta: Number(p.metaDaily), superm: Number(p.supermetaDaily) };
        }
        for (const sid of storeIds) {
          metaForRow[sid] = best[sid]
            ? { metaDaily: best[sid].meta, superDaily: best[sid].superm }
            : {};
        }
      }
    } else if (q.scope === SalesDailyScope.STORE) {
      // uma única policy para a loja aplicada a todas as linhas (funcionários)
      const pol = await this.prisma.goalPolicy.findFirst({
        where: { scopeType: 'STORE', scopeId: q.id, effectiveFrom: { lte: startD } },
        orderBy: { effectiveFrom: 'desc' },
      });
      const common = pol ? { metaDaily: Number(pol.metaDaily), superDaily: Number(pol.supermetaDaily) } : {};
      for (const empId of Object.keys(labels)) metaForRow[empId] = common;
    } else {
      // EMPLOYEE
      const empId = q.id!;
      let metaDaily: number | undefined;
      let superDaily: number | undefined;

      const pEmp = await this.prisma.goalPolicy.findFirst({
        where: { scopeType: 'EMPLOYEE', scopeId: empId, effectiveFrom: { lte: startD } },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (pEmp) {
        metaDaily = Number(pEmp.metaDaily);
        superDaily = Number(pEmp.supermetaDaily);
      } else {
        // fallback: meta da loja do funcionário
        let storeId: string | undefined = empStoreByEmpId.get(empId)?.storeId;
        if (!storeId) {
          const emp = await this.prisma.employee.findUnique({
            where: { id: empId },
            select: { storeId: true },
          });
          storeId = emp?.storeId;
        }
        if (storeId) {
          const pStore = await this.prisma.goalPolicy.findFirst({
            where: { scopeType: 'STORE', scopeId: storeId, effectiveFrom: { lte: startD } },
            orderBy: { effectiveFrom: 'desc' },
          });
          if (pStore) {
            metaDaily = Number(pStore.metaDaily);
            superDaily = Number(pStore.supermetaDaily);
          }
        }
      }
      metaForRow[empId] = { metaDaily, superDaily };
    }

    // dias decorridos (para projeção e para o front pintar "n" nos dias futuros)
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const end0 = new Date(endD); end0.setUTCHours(0, 0, 0, 0);
    const minRef = today.getTime() < end0.getTime() ? today : end0;
    let daysElapsed = Math.floor((minRef.getTime() - startD.getTime()) / 86_400_000) + 1;
    if (daysElapsed < 0) daysElapsed = 0;
    if (daysElapsed > totalDays) daysElapsed = totalDays;

    // monta linhas
    const groupIds = Object.keys(labels);
    const rows = groupIds.map((gid) => {
      const values = series.get(gid)!;
      const total = values.reduce((a, b) => a + (b || 0), 0);

      const { metaDaily, superDaily } = metaForRow[gid] || {};
      const metaMonth = metaDaily != null ? Math.round(metaDaily * totalDays) : undefined;
      const supermetaMonth = superDaily != null ? Math.round(superDaily * totalDays) : undefined;

      const partial = values.slice(0, daysElapsed).reduce((a, b) => a + (b || 0), 0);
      const avg = daysElapsed > 0 ? partial / daysElapsed : 0;
      const projection = Math.round(avg * totalDays);

      return {
        id: gid,
        label: labels[gid] ?? gid,
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
  // setDaily (edição inline de um dia do funcionário)
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
        select: { id: true, employeeId: true, storeId: true, clientId: true, saleDate: true, amount: true },
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
        select: { id: true, employeeId: true, storeId: true, clientId: true, saleDate: true, amount: true },
      });
      return { ok: true, sale: created };
    }
  }

  // ----------------------------------------------------------------------
  // RBAC helper (valida também a presença do id quando necessário)
  // ----------------------------------------------------------------------
  private async assertDailyScope(user: types.JwtUser, q: SalesDailyQueryDto) {
    if (q.scope === SalesDailyScope.SYSTEM) {
      if (user.role !== 'ADMIN') throw new ForbiddenException();
      return;
    }

    if (user.role === 'ADMIN') {
      // ADMIN pode ver qualquer escopo, mas precisa de id quando exigido
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
      if (user.role === 'CLIENT_ADMIN' && store.clientId !== user.clientId) throw new ForbiddenException();
      if (user.role === 'STORE_MANAGER' && store.id !== user.storeId) throw new ForbiddenException();
      return;
    }

    if (q.scope === SalesDailyScope.EMPLOYEE) {
      if (!q.id) throw new BadRequestException('id é obrigatório quando scope=EMPLOYEE');
      const emp = await this.prisma.employee.findUnique({
        where: { id: q.id },
        select: { store: { select: { id: true, clientId: true } } },
      });
      if (!emp) throw new ForbiddenException();
      if (user.role === 'CLIENT_ADMIN' && emp.store.clientId !== user.clientId) throw new ForbiddenException();
      if (user.role === 'STORE_MANAGER' && emp.store.id !== user.storeId) throw new ForbiddenException();
      return;
    }

    throw new ForbiddenException();
  }
}
