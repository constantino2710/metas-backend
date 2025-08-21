/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsEnum(Role)
  role!: Role; // 'ADMIN' | 'CLIENT_ADMIN' | 'STORE_MANAGER'

  // Obrigatório para CLIENT_ADMIN e STORE_MANAGER (mas no caso do CLIENT_ADMIN do próprio client,
  // o service sobrescreve com o clientId do criador)
  @ValidateIf(o => o.role === 'CLIENT_ADMIN' || o.role === 'STORE_MANAGER')
  @IsUUID()
  @IsOptional()
  clientId?: string;

  // Obrigatório para STORE_MANAGER
  @ValidateIf((o) => o.role === 'STORE_MANAGER')
  @IsUUID()
  @IsOptional()
  storeId?: string;
}
