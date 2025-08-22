// src/users/dtos/create-user.dto.ts
/* eslint-disable prettier/prettier */
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsEmail() email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsEnum(Role)
  role!: Role; // 'ADMIN' | 'CLIENT_ADMIN' | 'STORE_MANAGER'

  // Para CLIENT_ADMIN (ADMIN deve informar), ignorado para outros
  @IsOptional()
  @IsUUID()
  clientId?: string;

  // Para STORE_MANAGER (ADMIN/CLIENT_ADMIN devem informar)
  @IsOptional()
  @IsUUID()
  storeId?: string;
}
