/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as types from '../auth/types';
import { Sale } from '@prisma/client';
import { SalesListQueryDto } from './dtos/sales-list.query.dto';
import { CreateSaleDto } from './dtos/create-sale.dto';
import { SalesDailyQueryDto, SalesDailyScope } from './dtos/sales-daily.query.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista de vendas com RBAC aplicado.
   */
  async list(user: types.JwtUser, q: SalesListQueryDto): Promise<Sale[]> {
    // RBAC básico
    const where: any = {};
    if (user.role === 'ADMIN') {
      // sem restrição
    } else if (user.role === 'CLIENT_ADMIN') {
      where.clientId = (user as any).clientId;
    } else if (user.role === 'STORE_MANAGER') {
      where.storeId = (user as any).storeId;
    } else {
      throw new ForbiddenException();
    }

    // filtros opcionais
    if (q.clientId) where.clientId = q.clientId;
    if (q.storeId) where.storeId = q.storeId;
    if (q.employeeId) where.employeeId = q.employeeId;

    if (q.start || q.end) {
      where.saleDate = {};
      if (q.start) where.saleDate.gte = new Date(String(q.start));
      if (q.end) where.saleDate.lte = new Date(String(q.end));
    }

    return this.prisma.sale.findMany({
      where,
      orderBy: [{ saleDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Criação de venda com validações simples.
   */
  async create(user: types.JwtUser, dto: CreateSaleDto): Promise<Sale> {
    if (!['ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER'].includes(user.role)) {
      throw new ForbiddenException();
    }

    const store = await this.prisma.store.findUnique({
      where: { id: dto.storeId },
      select: { id: true, clientId: true, isActive: true },
    });
    if (!store || !store.isActive) throw new NotFoundException('Loja não encontrada');

    if (user.role === 'CLIENT_ADMIN' && store.clientId !== (user as any).clientId) {
      throw new ForbiddenException('Loja fora do seu escopo');
    }
    if (user.role === 'STORE_MANAGER' && (user as any).storeId !== store.id) {
      throw new ForbiddenException('Loja fora do seu escopo');
    }

    const emp = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: { id: true, storeId: true, isActive: true },
    });
    if (!emp || !emp.isActive || emp.storeId !== store.id) {
      throw new ForbiddenException('Funcionário inválido para a loja');
    }

    const createdBy = (user as any).id ?? (user as any).sub ?? undefined;

    return this.prisma.sale.create({
      data: {
        id: dto.id, // remova esta linha se o ID for gerado pelo banco
        clientId: store.clientId,
        storeId: store.id,
        employeeId: emp.id,
        saleDate: new Date(String(dto.saleDate)),
        amount: Number(dto.amount),
        itemsCount: dto.itemsCount ?? null,
        note: dto.note ?? null,
        createdBy,
      },
    });
  }

  /**
   * Série diária agregada por CLIENTE (linhas=lojas),
   * por LOJA (linhas=funcionários) ou por FUNCIONÁRIO (uma linha).
   * Inclui metas, supermetas, projeção e totais por dia.
   */
  async daily(user: types.JwtUser, q: SalesDailyQueryDto): Promise<any> {
    await this.assertDailyScope(user, q);

    const start = String(q.start);
    const end = String(q.end);
    const startD = new Date(start + 'T00:00:00.000Z');
    const endD = new Date(end + 'T00:00:00.000Z');

    let filterCol = '';
    let groupCol = '';
    let groupScope: 'STORE' | 'EMPLOYEE' = 'STORE';
    if (q.scope === SalesDailyScope.CLIENT) {
      filterCol = '"clientId"';
      groupCol = '"storeId"';
      groupScope = 'STORE';
    }
    if (q.scope === SalesDailyScope.STORE) {
      filterCol = '"storeId"';
      groupCol = '"employeeId"';
      groupScope = 'EMPLOYEE';
    }
    if (q.scope === SalesDailyScope.EMPLOYEE) {
      filterCol = '"employeeId"';
      groupCol = '"employeeId"';
      groupScope = 'EMPLOYEE';
    }

    // ---- vendas por dia / linha
    const sql = `
      SELECT
        (date_trunc('day', "saleDate")::date)::text AS d,
        (${groupCol})::text AS group_id,
        SUM("amount")::float AS value
      FROM "Sale"
      WHERE ${filterCol} = $1::uuid
        AND "saleDate" BETWEEN $2::date AND $3::date
      GROUP BY 1, 2
      ORDER BY 1 ASC
    `;
    const rowsRaw: Array<{ d: string; group_id: string; value: number }> =
      await this.prisma.$queryRawUnsafe(sql, q.id, start, end);

    // ---- eixo de dias
    const days: string[] = [];
    for (let d = new Date(startD); d <= endD; d.setUTCDate(d.getUTCDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }
    const totalDays = days.length;
    const idx = new Map(days.map((d, i) => [d, i]));

    // ---- séries por linha
    const series = new Map<string, number[]>();
    for (const r of rowsRaw) {
      if (!series.has(r.group_id)) series.set(r.group_id, Array(totalDays).fill(0));
      const i = idx.get(r.d);
      if (i !== undefined) series.get(r.group_id)![i] += Number(r.value || 0);
    }

    // ---- labels das linhas
    let labels: Record<string, string> = {};
    if (q.scope === SalesDailyScope.CLIENT) {
      const stores = await this.prisma.store.findMany({
        where: { clientId: q.id, isActive: true },
        select: { id: true, name: true },
      });
      labels = Object.fromEntries(stores.map((s) => [s.id, s.name]));
    } else if (q.scope === SalesDailyScope.STORE) {
      const emps = await this.prisma.employee.findMany({
        where: { storeId: q.id, isActive: true },
        select: { id: true, fullName: true },
      });
      labels = Object.fromEntries(emps.map((e) => [e.id, e.fullName]));
    } else {
      const emp = await this.prisma.employee.findUnique({
        where: { id: q.id },
        select: { id: true, fullName: true },
      });
      if (emp) labels[emp.id] = emp.fullName;
    }

    // ---- garante linhas zeradas para quem não teve venda
    for (const gid of Object.keys(labels)) {
      if (!series.has(gid)) series.set(gid, Array(totalDays).fill(0));
    }

    // ---- metas por linha (vigentes no início do período)
    const startPolicyDate = startD;
    const groupIds = Object.keys(labels);

    // NOVO: quando estamos em scope=STORE (linhas = funcionários),
    // buscamos UMA VEZ a meta da LOJA e usamos como HERANÇA
    let storePolicyForEmployeeRows: { metaDaily?: number; superDaily?: number } | null = null;
    if (q.scope === SalesDailyScope.STORE) {
      const storePol = await this.prisma.goalPolicy.findFirst({
        where: {
          scopeType: 'STORE',
          scopeId: q.id,
          effectiveFrom: { lte: startPolicyDate },
        },
        orderBy: { effectiveFrom: 'desc' },
        select: { metaDaily: true, supermetaDaily: true },
      });
      if (storePol) {
        storePolicyForEmployeeRows = {
          metaDaily: Number(storePol.metaDaily),
          superDaily: Number(storePol.supermetaDaily),
        };
      }
    }

    const policies: Record<string, { metaDaily?: number; superDaily?: number }> = {};
    for (const gid of groupIds) {
      if (groupScope === 'STORE') {
        // linha = LOJA
        const storePol = await this.prisma.goalPolicy.findFirst({
          where: { scopeType: 'STORE', scopeId: gid, effectiveFrom: { lte: startPolicyDate } },
          orderBy: { effectiveFrom: 'desc' },
          select: { metaDaily: true, supermetaDaily: true },
        });
        if (storePol) {
          policies[gid] = {
            metaDaily: Number(storePol.metaDaily),
            superDaily: Number(storePol.supermetaDaily),
          };
        } else {
          // fallback: soma metas de funcionários (mantido por compatibilidade)
          policies[gid] = await this.sumEmployeeGoalsForStore(gid, startPolicyDate);
        }
      } else {
        // linha = FUNCIONÁRIO
        const empPol = await this.prisma.goalPolicy.findFirst({
          where: { scopeType: 'EMPLOYEE', scopeId: gid, effectiveFrom: { lte: startPolicyDate } },
          orderBy: { effectiveFrom: 'desc' },
          select: { metaDaily: true, supermetaDaily: true },
        });
        if (empPol) {
          policies[gid] = {
            metaDaily: Number(empPol.metaDaily),
            superDaily: Number(empPol.supermetaDaily),
          };
        } else if (storePolicyForEmployeeRows) {
          // HERANÇA: se o funcionário não tem meta própria, usa a meta da LOJA
          policies[gid] = { ...storePolicyForEmployeeRows };
        } else {
          policies[gid] = { metaDaily: undefined, superDaily: undefined };
        }
      }
    }

    // ---- dias decorridos (clamp hoje)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const startMs = startD.getTime();
    const endMs = endD.getTime();
    const clampTo = Math.min(today.getTime(), endMs);
    const daysElapsed = Math.min(
      totalDays,
      Math.max(0, Math.floor((clampTo - startMs) / 86_400_000) + 1),
    );

    // ---- monta linhas
    const rows = groupIds.map((gid) => {
      const values = series.get(gid)!;
      const total = values.reduce((a, b) => a + (Number(b) || 0), 0);
      const metaD = policies[gid].metaDaily;
      const superD = policies[gid].superDaily;

      const metaMonth = metaD !== undefined ? Math.round(metaD * totalDays) : undefined;
      const supermetaMonth = superD !== undefined ? Math.round(superD * totalDays) : undefined;

      const partial = values.slice(0, daysElapsed).reduce((a, b) => a + (Number(b) || 0), 0);
      const avg = daysElapsed > 0 ? partial / daysElapsed : 0;
      const projection = Math.round(avg * totalDays);

      return {
        id: gid,
        label: labels[gid] ?? gid,
        values,
        total,
        metaDaily: metaD,
        superDaily: superD,
        metaMonth,
        supermetaMonth,
        projection,
      };
    });

    const totalsByDay = days.map((_, i) => rows.reduce((acc, r) => acc + (r.values[i] || 0), 0));
    const grandTotal = totalsByDay.reduce((a, b) => a + b, 0);

    return {
      period: { start, end, days: totalDays, daysElapsed },
      days,
      rows,
      totalsByDay,
      grandTotal,
    };
  }

  /**
   * RBAC para /sales/daily
   */
  private async assertDailyScope(user: types.JwtUser, q: SalesDailyQueryDto) {
    if (user.role === 'ADMIN') return;

    if (q.scope === SalesDailyScope.CLIENT) {
      if (user.role !== 'CLIENT_ADMIN') throw new ForbiddenException();
      if ((user as any).clientId !== q.id) throw new ForbiddenException('Cliente fora do seu escopo');
      return;
    }

    if (q.scope === SalesDailyScope.STORE) {
      if (user.role === 'CLIENT_ADMIN') {
        const store = await this.prisma.store.findUnique({
          where: { id: q.id },
          select: { clientId: true },
        });
        if (!store || store.clientId !== (user as any).clientId) {
          throw new ForbiddenException('Loja fora do seu escopo');
        }
        return;
      }
      if (user.role === 'STORE_MANAGER') {
        if ((user as any).storeId !== q.id) throw new ForbiddenException('Loja fora do seu escopo');
        return;
      }
    }

    if (q.scope === SalesDailyScope.EMPLOYEE) {
      const emp = await this.prisma.employee.findUnique({
        where: { id: q.id },
        select: { store: { select: { id: true, clientId: true } } },
      });
      if (!emp) throw new ForbiddenException();
      if (user.role === 'CLIENT_ADMIN' && emp.store.clientId !== (user as any).clientId) {
        throw new ForbiddenException();
      }
      if (user.role === 'STORE_MANAGER' && emp.store.id !== (user as any).storeId) {
        throw new ForbiddenException();
      }
      return;
    }

    throw new ForbiddenException();
  }

  /**
   * (Compat) Soma metas dos funcionários ativos de uma loja, vigentes em `asOf`.
   * Mantido para cenários onde não exista meta de LOJA cadastrada.
   */
  private async sumEmployeeGoalsForStore(
    storeId: string,
    asOf: Date,
  ): Promise<{ metaDaily?: number; superDaily?: number }> {
    const emps = await this.prisma.employee.findMany({
      where: { storeId, isActive: true },
      select: { id: true },
    });
    if (emps.length === 0) return { metaDaily: undefined, superDaily: undefined };

    let meta = 0;
    let superm = 0;

    for (const e of emps) {
      const pol = await this.prisma.goalPolicy.findFirst({
        where: {
          scopeType: 'EMPLOYEE',
          scopeId: e.id,
          effectiveFrom: { lte: asOf },
        },
        orderBy: { effectiveFrom: 'desc' },
        select: { metaDaily: true, supermetaDaily: true },
      });
      if (pol?.metaDaily != null) meta += Number(pol.metaDaily);
      if (pol?.supermetaDaily != null) superm += Number(pol.supermetaDaily);
    }

    return {
      metaDaily: meta || undefined,
      superDaily: superm || undefined,
    };
  }
}
