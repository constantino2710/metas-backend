import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PrismaService } from '../database/prisma.service';
import { GoalResolverService } from '../goals/goal-resolver.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, PrismaService, GoalResolverService],
})
export class ReportsModule {}
