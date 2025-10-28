/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
  Matches,
  ValidateIf,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GoalScope } from '@prisma/client';

@ValidatorConstraint({ name: 'AtLeastOneMeta', async: false })
class AtLeastOneMeta implements ValidatorConstraintInterface {
  validate(_: any, args: ValidationArguments): boolean {
    const o = args.object as CreateGoalDto;
    return o.metaDaily !== undefined || o.metaMonthly !== undefined;
  }
  defaultMessage(): string {
    return 'Informe metaDaily ou metaMonthly';
  }
}

export class CreateGoalDto {
  @ApiProperty({ enum: GoalScope })
  @IsEnum(GoalScope)
  scopeType!: GoalScope;

  @ApiProperty()
  @IsUUID()
  scopeId!: string;

  @ApiProperty({ example: '2025-08-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'effectiveFrom deve ser YYYY-MM-DD' })
  effectiveFrom!: string;

  @ApiPropertyOptional({ description: 'Meta diária (unidades ou valor)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.metaMonthly === undefined)
  metaDaily?: number;

  @ApiPropertyOptional({ description: 'Meta mensal; se informada, vira metaDaily automaticamente' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.metaDaily === undefined)
  metaMonthly?: number;

  @ApiPropertyOptional({ description: 'Super meta diária (opcional)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  supermetaDaily?: number;

  @ApiPropertyOptional({ description: 'Super meta mensal (opcional)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  supermetaMonthly?: number;

  @ApiPropertyOptional({ description: 'Percentual para super meta (ex.: 30 = 30%)', example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  superPercent?: number;

  @ApiPropertyOptional({ description: 'Usar só dias úteis ao converter meta mensal → diária', example: false })
  @IsOptional()
  workdaysOnly?: boolean;

  @Validate(AtLeastOneMeta)
  private _atLeastOne!: unknown;
}
