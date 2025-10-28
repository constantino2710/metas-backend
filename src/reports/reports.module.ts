/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PrismaService } from '../database/prisma.service';
import { GoalsModule } from '../goals/goals.module';

@Module({
  imports: [GoalsModule],                       // <<< importa quem exporta Goals/Resolver
  controllers: [ReportsController],
  providers: [PrismaService, ReportsService],   // <<< não coloque GoalResolver/Goals aqui
  exports: [ReportsService],
})
export class ReportsModule {}
