/* eslint-disable prettier/prettier */
// src/users/dtos/create-user.dto.ts
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsEmail() email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsEnum(Role)
  role!: Role; // 'ADMIN' | 'CLIENT_ADMIN' | 'STORE_MANAGER'

  @IsString()
  @MinLength(2)
  fullName!: string; // <— adicionado

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;
}
