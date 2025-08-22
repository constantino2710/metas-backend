/* eslint-disable prettier/prettier */
// src/goals/dtos/create-goal.dto.ts
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';
import { GoalScope } from '@prisma/client';

export class CreateGoalDto {
  @IsEnum(GoalScope)
  scopeType!: GoalScope; // CLIENT | STORE | EMPLOYEE

  @IsUUID()
  scopeId!: string;      // id do client/store/employee

  @IsNumber() @IsPositive()
  metaDaily!: number;

  @IsOptional() @IsNumber() @IsPositive()
  supermetaDaily?: number;

  @IsDateString()
  effectiveFrom!: string; // "YYYY-MM-DD"
}
