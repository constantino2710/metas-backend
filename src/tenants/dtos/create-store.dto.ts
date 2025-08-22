/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateStoreDto {
  // ADMIN deve informar; CLIENT_ADMIN ignora o body e usa o clientId do token
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}
