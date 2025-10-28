/* eslint-disable prettier/prettier */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export enum SalesDailyScope {
  SYSTEM = 'SYSTEM',    // agrupa por cliente
  CLIENT = 'CLIENT',    // agrupa por loja
  STORE = 'STORE',      // agrupa por funcionário
  EMPLOYEE = 'EMPLOYEE' // série única (o próprio funcionário)
}

export class SalesDailyQueryDto {
  @ApiProperty({ enum: SalesDailyScope })
  @IsEnum(SalesDailyScope)
  scope!: SalesDailyScope;

  @ApiPropertyOptional({ description: 'ID exigido para CLIENT/STORE/EMPLOYEE' })
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
