import { IsJWT, IsOptional } from 'class-validator';

export class RefreshDto {
  @IsOptional()
  @IsJWT()
  refreshToken?: string;
}
