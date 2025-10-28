/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dtos/create-goal.dto';
import { GoalsEffectiveQueryDto } from './dtos/goals-effective.query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';
import { Roles } from '../auth/roles.decorator';

@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Post()
  @Roles(types.Role.ADMIN, types.Role.CLIENT_ADMIN, types.Role.STORE_MANAGER)
  create(@CurrentUser() user: types.JwtUser, @Body() dto: CreateGoalDto) {
    return this.goals.create(user, dto);
  }

  @Get('effective')
  @Roles(types.Role.ADMIN, types.Role.CLIENT_ADMIN, types.Role.STORE_MANAGER)
  effective(@CurrentUser() user: types.JwtUser, @Query() q: GoalsEffectiveQueryDto) {
    return this.goals.getEffective(user, q);
  }
}
