/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dtos/create-employee.dto';
import { UpdateEmployeeDto } from './dtos/update-employee.dto';
import { EmployeesListQueryDto } from './dtos/employees-list.query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';
import { Roles } from '../auth/roles.decorator';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @Roles(types.Role.ADMIN, types.Role.CLIENT_ADMIN, types.Role.STORE_MANAGER)
  list(@CurrentUser() user: types.JwtUser, @Query() q: EmployeesListQueryDto) {
    return this.employees.list(user, q);
  }

  @Post()
  @Roles(types.Role.ADMIN, types.Role.CLIENT_ADMIN, types.Role.STORE_MANAGER)
  create(@CurrentUser() user: types.JwtUser, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(user, dto);
  }

  @Patch(':id')
  @Roles(types.Role.ADMIN, types.Role.CLIENT_ADMIN, types.Role.STORE_MANAGER)
  update(
    @CurrentUser() user: types.JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(user, id, dto);
  }
}
