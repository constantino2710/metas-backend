import { Transform } from 'class-transformer';
import { IsEnum, IsString, Matches, IsUUID, IsIn } from 'class-validator';
import { GoalScope } from '@prisma/client';

export class GoalsVsSalesQuery {
  // YYYY-MM-DD
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  // YYYY-MM-DD
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;

  @IsEnum(GoalScope)
  scopeType!: GoalScope;

  @IsUUID()
  scopeId!: string;

  @Transform(({ value }) => String(value).toLowerCase())
  @IsIn(['daily', 'monthly'])
  granularity!: 'daily' | 'monthly';
}
