import { IsUUID, IsDateString, IsNumber } from 'class-validator';

export class SetDailyDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  saleDate!: string; // YYYY-MM-DD

  @IsNumber()
  amount!: number;
}
