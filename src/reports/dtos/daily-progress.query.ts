import { IsEnum, IsOptional, IsString, Matches, IsUUID } from 'class-validator';
import { GoalScope } from '@prisma/client';

export class DailyProgressQuery {
  // optional YYYY-MM-DD; defaults to today
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  date?: string;

  @IsEnum(GoalScope)
  scopeType!: GoalScope;

  @IsUUID()
  scopeId!: string;
}
