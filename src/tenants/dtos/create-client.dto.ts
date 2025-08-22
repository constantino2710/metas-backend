/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}
