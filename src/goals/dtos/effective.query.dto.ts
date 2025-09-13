// src/goals/dtos/effective.query.dto.ts
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class EffectiveQueryDto {
  @IsUUID() clientId!: string;
  @IsOptional() @IsUUID() storeId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() sectorId?: string;
  @IsOptional() @IsDateString() date?: string; // default = hoje
}
