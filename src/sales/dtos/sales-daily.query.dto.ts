import { IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export enum SalesDailyScope {
  SYSTEM = 'SYSTEM',
  CLIENT = 'CLIENT',
  STORE = 'STORE',
  EMPLOYEE = 'EMPLOYEE',
}

export class SalesDailyQueryDto {
  // Normaliza para MAIÚSCULAS (ex.: "system" -> "SYSTEM")
  @Transform(({ value }) => String(value).toUpperCase())
  @IsEnum(SalesDailyScope)
  scope!: SalesDailyScope;

  // obrigatório para CLIENT/STORE/EMPLOYEE
  @IsOptional()
  @IsUUID()
  id?: string;

  // YYYY-MM-DD
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  start!: string;

  // YYYY-MM-DD
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  end!: string;
}
