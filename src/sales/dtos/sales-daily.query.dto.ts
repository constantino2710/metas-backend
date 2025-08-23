import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsUUID } from 'class-validator';

export enum SalesDailyScope {
  CLIENT = 'client',
  STORE = 'store',
  EMPLOYEE = 'employee',
}

export class SalesDailyQueryDto {
  @ApiProperty({ enum: SalesDailyScope })
  @IsEnum(SalesDailyScope)
  scope!: SalesDailyScope;

  @ApiProperty({ example: '22222222-2222-4222-8222-222222222221' })
  @IsUUID()
  id!: string; // clientId | storeId | employeeId (depende do scope)

  @ApiProperty({ example: '2025-08-01' })
  @IsISO8601()
  start!: string; // YYYY-MM-DD

  @ApiProperty({ example: '2025-08-31' })
  @IsISO8601()
  end!: string; // YYYY-MM-DD
}
