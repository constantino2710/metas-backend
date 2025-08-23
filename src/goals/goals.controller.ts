/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';
import { GoalsService } from './goals.service';
import { GoalsEffectiveQueryDto } from './dtos/goals-effective.query.dto';
import { CreateGoalDto } from './dtos/create-goal.dto';

@ApiTags('goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get('effective')
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  effective(@CurrentUser() user: types.JwtUser, @Query() q: GoalsEffectiveQueryDto) {
    return this.goals.effective(user, q);
  }

  // 👇 Novo: cadastra/atualiza meta; calcula super meta automaticamente se não for enviada
  @Post()
  @Roles('ADMIN', 'CLIENT_ADMIN') // gerente de loja geralmente não define política
  create(@CurrentUser() user: types.JwtUser, @Body() dto: CreateGoalDto) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.goals.create(user, dto);
  }
}
