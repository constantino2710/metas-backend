/* eslint-disable prettier/prettier */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export class GoalsEffectiveQueryDto {
  @ApiPropertyOptional({
    example: '2025-08-01',
    description: 'Data de referência (YYYY-MM-DD). Se omitida, usa a data de hoje.',
  })
  @IsOptional()
  @Type(() => String)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date deve ser YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ description: 'Escopo cliente (UUID)' })
  @IsOptional()
  @Type(() => String)
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Escopo loja (UUID)' })
  @IsOptional()
  @Type(() => String)
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ description: 'Escopo funcionário (UUID)' })
  @IsOptional()
  @Type(() => String)
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Escopo setor (UUID)' })
  @IsOptional()
  @Type(() => String)
  @IsUUID()
  sectorId?: string;
}
