import { IsOptional, IsString, IsUUID } from 'class-validator';

export class EmployeesListQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsString()
  search?: string; // filtra por nome (contains, case-insensitive)
}
