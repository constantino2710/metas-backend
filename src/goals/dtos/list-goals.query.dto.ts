// src/goals/dtos/list-goals.query.dto.ts
import { IsEnum, IsUUID } from 'class-validator';
import { GoalScope } from '@prisma/client';

export class ListGoalsQueryDto {
  @IsEnum(GoalScope) scopeType!: GoalScope;
  @IsUUID() scopeId!: string;
}
