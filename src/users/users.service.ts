/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/users/users.service.ts
/* eslint-disable prettier/prettier */
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { JwtUser } from '../auth/types';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(requester: JwtUser, dto: CreateUserDto) {
    // Regras de quem pode criar o quê
    if (requester.role === 'STORE_MANAGER') {
      throw new ForbiddenException('STORE_MANAGER não cria usuários');
    }
    if (requester.role === 'CLIENT_ADMIN' && dto.role !== Role.STORE_MANAGER) {
      throw new ForbiddenException('CLIENT_ADMIN só cria STORE_MANAGER');
    }

    // Normaliza email
    const email = dto.email.trim().toLowerCase();

    // Regras por papel do usuário que está sendo criado
    let clientId: string | null = null;
    let storeId: string | null = null;

    if (dto.role === Role.ADMIN) {
      // ADMIN não tem vínculo
    }

    if (dto.role === Role.CLIENT_ADMIN) {
      // Só ADMIN cria CLIENT_ADMIN e DEVE informar clientId
      if (requester.role !== Role.ADMIN) {
        throw new ForbiddenException('Apenas ADMIN cria CLIENT_ADMIN');
      }
      if (!dto.clientId) throw new BadRequestException('clientId é obrigatório');
      const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
      if (!client) throw new BadRequestException('Cliente inexistente');
      clientId = client.id;
    }

    if (dto.role === Role.STORE_MANAGER) {
      // ADMIN e CLIENT_ADMIN podem criar; ambos DEVEM informar storeId
      if (!dto.storeId) throw new BadRequestException('storeId é obrigatório');
      const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
      if (!store) throw new BadRequestException('Loja inexistente');

      // Se quem cria é CLIENT_ADMIN, precisa ser loja do próprio cliente
      if (requester.role === Role.CLIENT_ADMIN) {
        if (!requester.clientId || store.clientId !== requester.clientId) {
          throw new ForbiddenException('Loja fora do seu cliente');
        }
      }

      storeId = store.id;
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Criação
    const created = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: dto.role,
        fullName: dto.fullName ?? undefined,   // opcional
        clientId: clientId ?? undefined,
        storeId: storeId ?? undefined,
      },
      select: {
        id: true,
        email: true,
        role: true,
        clientId: true,
        storeId: true,
        createdAt: true,
      },
    });

    return created;
  }
}
