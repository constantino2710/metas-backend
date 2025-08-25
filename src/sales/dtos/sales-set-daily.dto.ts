import { IsNumber, IsString, IsUUID, Matches } from 'class-validator';

export class SalesSetDailyDto {
  @IsUUID()
  employeeId!: string;

  // YYYY-MM-DD
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  saleDate!: string;

  @IsNumber()
  amount!: number; // valor do dia; use 0 para “zerar/remover”
}
