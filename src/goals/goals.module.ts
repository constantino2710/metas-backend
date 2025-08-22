import { Module } from '@nestjs/common';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { GoalResolverService } from './goal-resolver.service';
import { PrismaService } from '../database/prisma.service';

@Module({
  controllers: [GoalsController],
  providers: [GoalsService, GoalResolverService, PrismaService],
  exports: [GoalResolverService],
})
export class GoalsModule {}
