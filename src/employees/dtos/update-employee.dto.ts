import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  fullName?: string;

  // ADMIN/CLIENT_ADMIN podem mover para outra loja (no escopo); STORE_MANAGER é bloqueado
  @IsOptional()
  @IsUUID()
  storeId?: string;
}
