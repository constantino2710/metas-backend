import { IsDateString, IsNumber, IsUUID } from 'class-validator';

export class SalesSetDailyDto {
  @IsUUID()
  employeeId!: string;

  // YYYY-MM-DD
  @IsDateString()
  saleDate!: string;

  @IsNumber()
  amount!: number;
}
