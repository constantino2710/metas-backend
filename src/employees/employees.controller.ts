/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';
import { EmployeesListQueryDto } from './dtos/employees-list.query.dto';
import { CreateEmployeeDto } from './dtos/create-employee.dto';
import { UpdateEmployeeDto } from './dtos/update-employee.dto';

@ApiTags('employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard) // se você usa guards globais via APP_GUARD, pode remover esta linha
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  list(@CurrentUser() user: types.JwtUser, @Query() q: EmployeesListQueryDto) {
    return this.employees.list(user, q);
  }

  @Post()
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  create(@CurrentUser() user: types.JwtUser, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(user, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  update(@CurrentUser() user: types.JwtUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(user, id, dto);
  }
}
