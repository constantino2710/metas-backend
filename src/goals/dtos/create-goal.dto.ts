/* eslint-disable prettier/prettier */
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { GoalScope } from '@prisma/client';

export class CreateGoalDto {
  @ApiProperty({ enum: GoalScope })
  @IsEnum(GoalScope)
  scopeType!: GoalScope; // CLIENT | STORE | EMPLOYEE

  @ApiProperty()
  @IsUUID()
  scopeId!: string;

  @ApiProperty({ example: '2025-08-01' })
  @IsISO8601()
  effectiveFrom!: string; // YYYY-MM-DD

  // Informe EITHER metaDaily OR metaMonthly
  @ApiPropertyOptional({ description: 'Meta diária (unidades ou valor)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  metaDaily?: number;

  @ApiPropertyOptional({ description: 'Meta mensal; se informada, vira metaDaily automaticamente' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  metaMonthly?: number;

  // Super meta é OPCIONAL; se não vier, calculamos automaticamente
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  supermetaDaily?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  supermetaMonthly?: number;

  // Estratégia para calcular super meta quando não vier preenchida
  @ApiPropertyOptional({ description: 'Percentual para super meta (ex.: 30 = 30%)', example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  superPercent?: number; // default 30

  @ApiPropertyOptional({ description: 'Usar só dias úteis ao converter meta mensal → diária', example: false })
  @IsOptional()
  workdaysOnly?: boolean;
}
