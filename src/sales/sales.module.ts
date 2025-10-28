/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { PrismaService } from '../database/prisma.service';
import { GoalsModule } from '../goals/goals.module';

@Module({
  imports: [GoalsModule],                 // <— importa quem exporta GoalResolverService
  controllers: [SalesController],
  providers: [PrismaService, SalesService],
  exports: [SalesService],
})
export class SalesModule {}
