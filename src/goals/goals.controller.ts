/* eslint-disable prettier/prettier */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';
import { GoalsService } from './goals.service';
import { GoalsEffectiveQueryDto } from './dtos/goals-effective.query.dto';

@ApiTags('goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  // GET /goals/effective?date=YYYY-MM-DD&clientId|storeId|employeeId=...
  @Get('effective')
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  effective(
    @CurrentUser() user: types.JwtUser,
    @Query() q: GoalsEffectiveQueryDto,
  ) {
    return this.goals.effective(user, q);
  }
}
