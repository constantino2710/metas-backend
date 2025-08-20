/* eslint-disable prettier/prettier */
import { IsDateString, IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateSaleDto {
  @IsUUID() employeeId!: string;
  @IsDateString() saleDate!: string; // YYYY-MM-DD
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsInt() @Min(0) itemsCount?: number;
  @IsOptional() note?: string;
}
