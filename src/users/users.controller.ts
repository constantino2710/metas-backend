import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ADMIN pode criar qualquer papel; CLIENT_ADMIN só STORE_MANAGER (regras no service)
  @Post()
  @Roles('ADMIN', 'CLIENT_ADMIN')
  create(@CurrentUser() user: types.JwtUser, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }
}
