import { IsDateString, IsOptional, IsUUID } from 'class-validator';
export class SalesListQueryDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() storeId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsDateString() start?: string;
  @IsOptional() @IsDateString() end?: string;
}
