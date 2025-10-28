/* eslint-disable prettier/prettier */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ReportScope } from './goals-vs-sales.query';

export class MonthlyProgressQuery {
  @ApiProperty({ enum: ReportScope })
  @IsEnum(ReportScope)
  scope!: ReportScope;

  @ApiPropertyOptional({ description: 'Obrigatório para CLIENT/STORE/EMPLOYEE' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({ example: '2025-01-01' })
  @IsOptional()
  @Type(() => String)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'start deve ser YYYY-MM-DD' })
  start?: string;

  @ApiPropertyOptional({ example: '2025-12-31' })
  @IsOptional()
  @Type(() => String)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'end deve ser YYYY-MM-DD' })
  end?: string;
}
