/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
// src/goals/goals.controller.ts
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GoalsService } from './goals.service';
import { GoalResolverService } from './goal-resolver.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';
import { CreateGoalDto } from './dtos/create-goal.dto';
import { EffectiveQueryDto } from './dtos/effective.query.dto';
import { ListGoalsQueryDto } from './dtos/list-goals.query.dto';
import { GoalScope } from '@prisma/client';

@ApiTags('goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('goals')
export class GoalsController {
  constructor(
    private readonly goals: GoalsService,
    private readonly resolver: GoalResolverService,
  ) {}

  @Post()
  @Roles('ADMIN', 'CLIENT_ADMIN')
  create(@CurrentUser() user: types.JwtUser, @Body() dto: CreateGoalDto) {
    return this.goals.create(user, dto);
  }

  @Get()
  @Roles('ADMIN', 'CLIENT_ADMIN')
  list(@CurrentUser() user: types.JwtUser, @Query() q: ListGoalsQueryDto) {
    return this.goals.list(user, q.scopeType as GoalScope, q.scopeId);
  }

  @Get('effective')
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  async effective(@Query() q: EffectiveQueryDto) {
    const date = q.date ? new Date(q.date) : new Date();
    return this.resolver.resolve({
      clientId: q.clientId,
      storeId: q.storeId,
      employeeId: q.employeeId,
      date,
    });
  }
}
