/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { JwtUser } from '../auth/types';
import * as bcrypt from 'bcrypt';
import { Prisma, Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(requestUser: JwtUser, dto: CreateUserDto) {
    // 1) Quem pode criar o quê?
    if (requestUser.role === 'STORE_MANAGER') {
      throw new ForbiddenException('Store Manager não pode criar usuários');
    }
    if (requestUser.role === 'CLIENT_ADMIN' && dto.role !== 'STORE_MANAGER') {
      throw new ForbiddenException('Client Admin só pode criar Store Manager');
    }
    if (requestUser.role !== 'ADMIN' && dto.role === 'ADMIN') {
      throw new ForbiddenException('Apenas ADMIN pode criar ADMIN');
    }

    // 2) Normalizar/validar clientId/storeId conforme papel do NOVO usuário
    let clientId: string | undefined;
    let storeId: string | undefined;

    if (dto.role === 'CLIENT_ADMIN') {
      // ADMIN pode escolher o client; CLIENT_ADMIN ignora dto.clientId e usa o seu
      clientId = requestUser.role === 'ADMIN' ? dto.clientId : requestUser.clientId;
      if (!clientId) throw new BadRequestException('clientId é obrigatório para CLIENT_ADMIN');

      const client = await this.prisma.client.findUnique({ where: { id: clientId } });
      if (!client) throw new BadRequestException('Cliente inexistente');
    }

    if (dto.role === 'STORE_MANAGER') {
      // ADMIN pode criar em qualquer loja; CLIENT_ADMIN só dentro do seu cliente
      if (!dto.storeId) throw new BadRequestException('storeId é obrigatório para STORE_MANAGER');
      const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
      if (!store) throw new BadRequestException('Loja inexistente');

      if (requestUser.role === 'CLIENT_ADMIN') {
        if (!requestUser.clientId) throw new ForbiddenException('ClientId ausente no token');
        if (store.clientId !== requestUser.clientId) {
          throw new ForbiddenException('Loja fora do seu cliente');
        }
        clientId = requestUser.clientId;
      } else {
        // ADMIN pode passar clientId opcionalmente; se não passar, herda da loja
        if (dto.clientId && dto.clientId !== store.clientId) {
          throw new BadRequestException('clientId não corresponde à loja informada');
        }
        clientId = store.clientId;
      }
      storeId = store.id;
    }

    // 3) Hash de senha
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // 4) Criar usuário
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          role: dto.role as Role,
          clientId: clientId ?? null,
          storeId: storeId ?? null,
          isActive: true,
        },
        select: { id: true, email: true, role: true, clientId: true, storeId: true, isActive: true, createdAt: true },
      });

      return user;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('E-mail já está em uso');
      }
      throw e;
    }
  }
}
