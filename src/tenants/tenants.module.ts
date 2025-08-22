// src/tenants/tenants.module.ts
import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../database/prisma.service';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, PrismaService],
  exports: [TenantsService],
})
export class TenantsModule {}
