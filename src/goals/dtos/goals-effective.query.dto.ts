/* eslint-disable prettier/prettier */
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GoalsEffectiveQueryDto {
  @ApiPropertyOptional({ example: '2025-08-01', description: 'Data de referência (YYYY-MM-DD)' })
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional({ description: 'Escopo cliente' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Escopo loja' })
  @IsOptional()
  @IsUUID()
      storeId?: string;

    @ApiPropertyOptional({ description: 'Escopo funcionário' })
    @IsOptional()
    @IsUUID()
    employeeId?: string;

    @ApiPropertyOptional({ description: 'Escopo setor' })
    @IsOptional()
    @IsUUID()
    sectorId?: string;
  }