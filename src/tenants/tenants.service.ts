/* eslint-disable prettier/prettier */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { JwtUser } from '../auth/types';
import { CreateClientDto } from './dtos/create-client.dto';
import { CreateStoreDto } from './dtos/create-store.dto';

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
    if (user.role === 'ADMIN') {
      return this.prisma.store.findMany({
        where: { clientId: filter?.clientId ?? undefined },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (user.role === 'CLIENT_ADMIN') {
      if (!user.clientId) return [];
      return this.prisma.store.findMany({
        where: { clientId: user.clientId },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (user.role === 'STORE_MANAGER') {
      if (!user.storeId) return [];
      const s = await this.prisma.store.findUnique({ where: { id: user.storeId } });
      return s ? [s] : [];
    }

    return [];
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
