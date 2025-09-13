/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { JwtUser } from '../auth/types';
import { CreateClientDto } from './dtos/create-client.dto';
import { CreateStoreDto } from './dtos/create-store.dto';
import { GoalScope, Store } from '@prisma/client';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  // ----- Clients -----
  async listClients(user: JwtUser) {
    if (user.role === 'ADMIN') {
      return this.prisma.client.findMany({ orderBy: { createdAt: 'desc' } });
    }
    if (user.role === 'CLIENT_ADMIN') {
      if (!user.clientId) return [];
      const c = await this.prisma.client.findUnique({ where: { id: user.clientId } });
      return c ? [c] : [];
    }
    // STORE_MANAGER não vê clients (ajuste se quiser)
    return [];
  }

  async createClient(user: JwtUser, dto: CreateClientDto) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Sem permissão');
    return this.prisma.client.create({
      data: { name: dto.name },
    });
  }

  // ----- Stores -----
  async listStores(user: JwtUser, filter?: { clientId?: string }) {
    let stores: Store[] = [];
    if (user.role === 'ADMIN') {
        stores = await this.prisma.store.findMany({
        where: { clientId: filter?.clientId ?? undefined },
        orderBy: { createdAt: 'desc' },
      });
    } else if (user.role === 'CLIENT_ADMIN') {
      if (!user.clientId) return [];
        stores = await this.prisma.store.findMany({
        where: { clientId: user.clientId },
        orderBy: { createdAt: 'desc' },
      });
      }
     else if (user.role === 'STORE_MANAGER') {
      if (!user.storeId) return [];
      const s = await this.prisma.store.findUnique({ where: { id: user.storeId } });
      stores = s ? [s] : [];
    } else {
      return [];
    }

    const ids = stores.map(s => s.id);
    if (ids.length === 0) return stores.map(s => ({ ...s, dailyGoal: 0 }));

    const sectors = await this.prisma.sector.findMany({
      where: { storeId: { in: ids }, isActive: true },
      select: { id: true, storeId: true },
    });

    const policies = await this.prisma.goalPolicy.findMany({
      where: {
        scopeType: GoalScope.SECTOR,
        scopeId: { in: sectors.map(s => s.id) },
        effectiveFrom: { lte: new Date() },
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const latestBySector = new Map<string, (typeof policies)[number]>();
    for (const p of policies) {
      if (!latestBySector.has(p.scopeId)) latestBySector.set(p.scopeId, p);
    }

    const sumByStore = new Map<string, number>();
    for (const sector of sectors) {
      const meta = latestBySector.get(sector.id)?.metaDaily ?? 0;
      const num = typeof meta === 'number' ? meta : Number(meta);
      sumByStore.set(sector.storeId, (sumByStore.get(sector.storeId) ?? 0) + num);
    }

    return stores.map(s => ({ ...s, dailyGoal: sumByStore.get(s.id) ?? 0 }));
  }

  async createStore(user: JwtUser, dto: CreateStoreDto) {
    if (user.role === 'STORE_MANAGER') throw new ForbiddenException('Sem permissão');

    // ADMIN: precisa de clientId explícito
    if (user.role === 'ADMIN') {
      if (!dto.clientId) throw new ForbiddenException('clientId é obrigatório para ADMIN');
      const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
      if (!client) throw new NotFoundException('Cliente inexistente');
      return this.prisma.store.create({
        data: { name: dto.name, clientId: dto.clientId },
      });
    }

    // CLIENT_ADMIN: ignora o body e usa o clientId do token
    if (user.role === 'CLIENT_ADMIN') {
      if (!user.clientId) throw new ForbiddenException('Token sem clientId');
      const client = await this.prisma.client.findUnique({ where: { id: user.clientId } });
      if (!client) throw new NotFoundException('Cliente do token não encontrado');
      return this.prisma.store.create({
        data: { name: dto.name, clientId: user.clientId },
      });
    }

    // outras roles (se existirem)
    throw new ForbiddenException('Sem permissão');
  }
}
