/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ReportScope } from './goals-vs-sales.query';

export class DailyProgressQuery {
  @ApiProperty({ enum: ReportScope })
  @IsEnum(ReportScope)
  scope!: ReportScope;

  @ApiPropertyOptional({ description: 'Obrigatório para CLIENT/STORE/EMPLOYEE' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({ example: '2025-10-01' })
  @IsOptional()
  @Type(() => String)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'start deve ser YYYY-MM-DD' })
  start?: string;

  @ApiPropertyOptional({ example: '2025-10-31' })
  @IsOptional()
  @Type(() => String)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'end deve ser YYYY-MM-DD' })
  end?: string;
}
