/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { IsString, MinLength } from 'class-validator';
import { Transform, Expose } from 'class-transformer';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(6)
  @Expose()
  @Transform(
    ({ value, obj }) => {
      if (typeof value === 'string') {
        return value;
      }
      const fallback = (obj as Record<string, unknown>).password;
      return typeof fallback === 'string' ? fallback : undefined;
    },
    { toClassOnly: true },
  )
  newPassword!: string;
}
