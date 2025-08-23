/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import * as types from '../auth/types';

import { CreateSaleDto } from './dtos/create-sale.dto';
import { SalesListQueryDto } from './dtos/sales-list.query.dto';

// DTO da agregação diária
export enum SalesDailyScope {
  CLIENT = 'client',
  STORE = 'store',
  EMPLOYEE = 'employee',
}
export class SalesDailyQueryDto {
  scope: SalesDailyScope;        // client | store | employee
  id: string;                    // id do client/store/employee (conforme scope)
  start: string;                 // YYYY-MM-DD (inclusivo)
  end: string;                   // YYYY-MM-DD (inclusivo)
}

type DailyRow = { id: string; label: string; values: number[]; total: number };

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista de vendas com filtros e escopo por papel.
   * Filtros aceitos (se existirem no DTO): clientId, storeId, employeeId, start, end, q (busca por note), take/skip, order ('asc'|'desc').
   */
  async list(user: types.JwtUser, q: SalesListQueryDto) {
    const anyQ = q as any;

    // Base do where (escopo por papel)
    const where: Prisma.SaleWhereInput = {};

    if (user.role === 'CLIENT_ADMIN') {
      // força escopo ao client do usuário
      where.clientId = user.clientId!;
    } else if (user.role === 'STORE_MANAGER') {
      // força escopo à store do usuário
      where.storeId = user.storeId!;
    }

    // Filtros opcionais
    if (anyQ.clientId) where.clientId = anyQ.clientId;
    if (anyQ.storeId) where.storeId = anyQ.storeId;
    if (anyQ.employeeId) where.employeeId = anyQ.employeeId;

    // Período (por saleDate)
    if (anyQ.start || anyQ.end) {
      where.saleDate = {
        gte: anyQ.start ? new Date(String(anyQ.start) + 'T00:00:00.000Z') : undefined,
        lte: anyQ.end ? new Date(String(anyQ.end) + 'T23:59:59.999Z') : undefined,
      };
    }

    // Busca textual simples (nota)
    if (anyQ.q) {
      where.note = { contains: String(anyQ.q), mode: 'insensitive' };
    }

    // Paginação/ordenação
    const take = Math.min(Math.max(Number(anyQ.take ?? 100), 1), 500);
    const skip = Math.max(Number(anyQ.skip ?? 0), 0);
    const order = (anyQ.order === 'asc' ? 'asc' : 'desc') as Prisma.SortOrder;

    // Segurança adicional de escopo (ex.: se CLIENT_ADMIN pedir outro clientId, não retorna nada)
    await this.assertListScope(user, where);

    return this.prisma.sale.findMany({
      where,
      orderBy: [{ saleDate: order }, { createdAt: order }],
      skip,
      take,
    });
  }

  /**
   * Criação de venda com validação de relacionamentos e escopo.
   */
  async create(user: types.JwtUser, dto: CreateSaleDto) {
    const anyDto = dto as any;

    const clientId: string = anyDto.clientId;
    const storeId: string = anyDto.storeId;
    const employeeId: string = anyDto.employeeId;

    if (!clientId || !storeId || !employeeId) {
      throw new NotFoundException('clientId, storeId e employeeId são obrigatórios');
    }

    // Checa relacionamento Employee -> Store -> Client
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, storeId: true, store: { select: { id: true, clientId: true } } },
    });
    if (!employee) throw new NotFoundException('Funcionário não encontrado');

    if (employee.storeId !== storeId) {
      throw new ForbiddenException('Funcionário não pertence à loja informada');
    }
    if (employee.store.clientId !== clientId) {
      throw new ForbiddenException('Loja informada não pertence ao cliente informado');
    }

    // Escopo por papel
    if (user.role === 'CLIENT_ADMIN' && user.clientId !== clientId) {
      throw new ForbiddenException('Fora do escopo do cliente');
    }
    if (user.role === 'STORE_MANAGER' && user.storeId !== storeId) {
      throw new ForbiddenException('Fora do escopo da loja');
    }

    // saleDate: DATE -> use Date com meia-noite UTC
    const saleDateStr: string = anyDto.saleDate; // 'YYYY-MM-DD' esperado
    const saleDate = new Date(String(saleDateStr) + 'T00:00:00.000Z');

    // amount: DECIMAL -> use Prisma.Decimal
    const amountRaw = anyDto.amount; // number | string
    const amount = new Prisma.Decimal(String(amountRaw));

    const created = await this.prisma.sale.create({
      data: {
        clientId,
        storeId,
        employeeId,
        saleDate,
        amount,
        itemsCount: anyDto.itemsCount ?? null,
        note: anyDto.note ?? null,
        // Só inclui createdBy se existir no payload (sub, userId ou id)
        ...(user && (user as any).id     ? { createdBy: (user as any).id }     : {}),
        ...(user && (user as any).sub    ? { createdBy: (user as any).sub }    : {}),
        ...(user && (user as any).userId ? { createdBy: (user as any).userId } : {}),
      },
    });

    return created;
  }

  /**
   * Agregação diária para montar a grade (dias nas colunas).
   * - scope=client -> linhas = lojas do cliente
   * - scope=store  -> linhas = funcionários da loja
   * - scope=employee -> linha única (o próprio funcionário)
   * Retorna: { period, days, rows[{id,label,values[],total}], totalsByDay[], grandTotal }
   */
  async daily(user: types.JwtUser, q: SalesDailyQueryDto) {
    await this.assertDailyScope(user, q); // garante que o usuário só veja seu escopo

    // Datas inclusivas
    const start = String(q.start);
    const end = String(q.end);

    // Colunas de filtro/agrupamento
    let filterCol = '';
    let groupCol = '';
    if (q.scope === SalesDailyScope.CLIENT) { filterCol = '"clientId"';  groupCol = '"storeId"'; }
    if (q.scope === SalesDailyScope.STORE)  { filterCol = '"storeId"';   groupCol = '"employeeId"'; }
    if (q.scope === SalesDailyScope.EMPLOYEE){filterCol = '"employeeId"';groupCol = '"employeeId"'; }

    // SQL: soma por dia e pelo agrupador, usando saleDate
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

    // Executa agregação
    const rowsRaw: Array<{ d: string; group_id: string; value: number }> =
      await this.prisma.$queryRawUnsafe(sql, q.id, start, end);

    // Gera vetor de dias inclusivo (YYYY-MM-DD)
    const days: string[] = [];
    {
      const d0 = new Date(start + 'T00:00:00.000Z');
      const d1 = new Date(end + 'T00:00:00.000Z');
      for (let d = d0; d <= d1; d.setDate(d.getDate() + 1)) {
        days.push(d.toISOString().slice(0, 10));
      }
    }
    const idxByDay = new Map(days.map((d, i) => [d, i]));

    // Monta séries por group_id
    const series = new Map<string, number[]>();
    for (const r of rowsRaw) {
      if (!series.has(r.group_id)) series.set(r.group_id, Array(days.length).fill(0));
      const i = idxByDay.get(r.d);
      if (i !== undefined) series.get(r.group_id)![i] += r.value || 0;
    }

    // Rótulos amigáveis (lojas ou funcionários)
    let labels: Record<string, string> = {};
    if (q.scope === SalesDailyScope.CLIENT) {
      // linhas = lojas do cliente
      const stores = await this.prisma.store.findMany({
        where: { clientId: q.id, isActive: true },
        select: { id: true, name: true },
      });
      labels = Object.fromEntries(stores.map(s => [s.id, s.name]));
    } else {
      // linhas = funcionários (store/employee)
      if (q.scope === SalesDailyScope.STORE) {
        const emps = await this.prisma.employee.findMany({
          where: { storeId: q.id, isActive: true },
          select: { id: true, fullName: true },
        });
        labels = Object.fromEntries(emps.map(e => [e.id, e.fullName]));
      } else if (q.scope === SalesDailyScope.EMPLOYEE) {
        const emp = await this.prisma.employee.findUnique({
          where: { id: q.id },
          select: { id: true, fullName: true },
        });
        if (emp) labels[emp.id] = emp.fullName;
      }
    }

    // Constrói linhas finais
    const rows: DailyRow[] = [...series.entries()].map(([gid, values]) => ({
      id: gid,
      label: labels[gid] ?? gid,
      values,
      total: values.reduce((a, b) => a + b, 0),
    }));

    const totalsByDay = days.map((_, i) => rows.reduce((acc, r) => acc + (r.values[i] || 0), 0));
    const grandTotal = totalsByDay.reduce((a, b) => a + b, 0);

    return {
      period: { start, end },
      days,
      rows,
      totalsByDay,
      grandTotal,
    };
  }

  // -----------------------------
  // Helpers de segurança de escopo
  // -----------------------------

  /** Garante que o "where" de listagem não extrapola o escopo do usuário. */
  private async assertListScope(user: types.JwtUser, where: Prisma.SaleWhereInput) {
    if (user.role === 'ADMIN') return;

    if (user.role === 'CLIENT_ADMIN') {
      // if where.clientId existir e for diferente do client do usuário -> proíbe
      if (where.clientId && where.clientId !== user.clientId) {
        throw new ForbiddenException('Fora do escopo do cliente');
      }
      // se where.storeId existir, confirme que a store pertence ao client
      if (where.storeId) {
        const store = await this.prisma.store.findUnique({
          where: { id: String(where.storeId) },
          select: { clientId: true },
        });
        if (!store || store.clientId !== user.clientId) {
          throw new ForbiddenException('Loja fora do escopo do cliente');
        }
      }
    }

    if (user.role === 'STORE_MANAGER') {
      if (where.storeId && where.storeId !== user.storeId) {
        throw new ForbiddenException('Fora do escopo da loja');
      }
      // Se filtrou por employeeId, verifique se é da mesma loja
      if ((where as any).employeeId) {
        const emp = await this.prisma.employee.findUnique({
          where: { id: String((where as any).employeeId) },
          select: { storeId: true },
        });
        if (!emp || emp.storeId !== user.storeId) {
          throw new ForbiddenException('Funcionário fora do escopo da loja');
        }
      }
    }
  }

  /** Verifica escopo do endpoint daily. */
  private async assertDailyScope(user: types.JwtUser, q: SalesDailyQueryDto) {
    if (user.role === 'ADMIN') return;

    if (user.role === 'CLIENT_ADMIN') {
      if (q.scope === SalesDailyScope.CLIENT) {
        if (q.id !== user.clientId) throw new ForbiddenException('Fora do escopo do cliente');
        return;
      }
      if (q.scope === SalesDailyScope.STORE) {
        const store = await this.prisma.store.findUnique({ where: { id: q.id }, select: { clientId: true } });
        if (!store || store.clientId !== user.clientId) throw new ForbiddenException('Loja fora do escopo do cliente');
        return;
      }
      if (q.scope === SalesDailyScope.EMPLOYEE) {
        const emp = await this.prisma.employee.findUnique({
          where: { id: q.id },
          select: { store: { select: { clientId: true } } },
        });
        if (!emp || emp.store.clientId !== user.clientId) throw new ForbiddenException('Funcionário fora do escopo do cliente');
        return;
      }
    }

    if (user.role === 'STORE_MANAGER') {
      if (q.scope === SalesDailyScope.STORE) {
        if (q.id !== user.storeId) throw new ForbiddenException('Fora do escopo da loja');
        return;
      }
      if (q.scope === SalesDailyScope.EMPLOYEE) {
        const emp = await this.prisma.employee.findUnique({
          where: { id: q.id },
          select: { storeId: true },
        });
        if (!emp || emp.storeId !== user.storeId) throw new ForbiddenException('Funcionário fora do escopo da loja');
        return;
      }
      // STORE_MANAGER não deve consultar por scope=client
      throw new ForbiddenException('Escopo de cliente não permitido para STORE_MANAGER');
    }
  }
}
