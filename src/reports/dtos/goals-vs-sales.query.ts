/* eslint-disable prettier/prettier */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export enum ReportScope {
  SYSTEM = 'SYSTEM',    // todas as vendas (ADMIN)
  CLIENT = 'CLIENT',    // por cliente  (id obrigatório)
  STORE = 'STORE',      // por loja     (id obrigatório)
  EMPLOYEE = 'EMPLOYEE' // por funcionário (id obrigatório)
}

export class GoalsVsSalesQuery {
  @ApiProperty({ enum: ReportScope })
  @IsEnum(ReportScope)
  scope!: ReportScope;

  @ApiPropertyOptional({ description: 'Obrigatório para CLIENT/STORE/EMPLOYEE' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({ example: '2025-10-01', description: 'Início (YYYY-MM-DD)' })
  @IsOptional()
  @Type(() => String)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'start deve ser YYYY-MM-DD' })
  start?: string;

  @ApiPropertyOptional({ example: '2025-10-31', description: 'Fim (YYYY-MM-DD)' })
  @IsOptional()
  @Type(() => String)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'end deve ser YYYY-MM-DD' })
  end?: string;
}
