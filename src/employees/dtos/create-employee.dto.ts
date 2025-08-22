import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @Length(2, 120)
  fullName!: string;

  // ADMIN/CLIENT_ADMIN podem informar; STORE_MANAGER ignora (usa o storeId do token)
  @IsOptional()
  @IsUUID()
  storeId?: string;
}
