// src/users/users.controller.ts
/* eslint-disable prettier/prettier */
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateUserDto } from './dtos/create-user.dto';
import * as types from '../auth/types';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ADMIN cria ADMIN/CLIENT_ADMIN/STORE_MANAGER
  // CLIENT_ADMIN cria STORE_MANAGER (apenas nas lojas do seu cliente)
  @Post()
  @Roles('ADMIN', 'CLIENT_ADMIN')
  create(@CurrentUser() me: types.JwtUser, @Body() dto: CreateUserDto) {
    return this.users.create(me, dto);
  }
}
