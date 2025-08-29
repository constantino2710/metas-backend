// src/tenants/tenants.module.ts
import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { StoresController } from './stores.controller';
import { ClientsController } from './clients.controller';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../database/prisma.service';

@Module({
  controllers: [TenantsController, StoresController, ClientsController],
  providers: [TenantsService, PrismaService],
  exports: [TenantsService],
})
export class TenantsModule {}
