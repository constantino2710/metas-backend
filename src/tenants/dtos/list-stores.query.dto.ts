/* eslint-disable prettier/prettier */
import { IsOptional, IsUUID } from 'class-validator';

export class ListStoresQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
