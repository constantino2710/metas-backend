/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { GoalResolverService } from './goal-resolver.service';
import { PrismaService } from '../database/prisma.service';

@Module({
  providers: [PrismaService, GoalsService, GoalResolverService],
  exports:   [GoalsService, GoalResolverService], // <<< exporta os dois
})
export class GoalsModule {}
