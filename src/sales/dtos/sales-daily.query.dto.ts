/* eslint-disable prettier/prettier */
import { IsEnum, IsISO8601, IsString } from 'class-validator';

export enum SalesDailyScope {
  CLIENT = 'client',
  STORE = 'store',
  EMPLOYEE = 'employee',
}

export class SalesDailyQueryDto {
  @IsEnum(SalesDailyScope)
  scope: SalesDailyScope;      // client | store | employee

  @IsString()
  id: string;                  // id do client/store/employee, conforme o scope

  @IsISO8601()
  start: string;               // YYYY-MM-DD (inclusivo)

  @IsISO8601()
  end: string;                 // YYYY-MM-DD (inclusivo)
}
