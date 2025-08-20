import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { StoresController } from './stores.controller';
import { PrismaService } from '../database/prisma.service';

@Module({
  controllers: [ClientsController, StoresController],
  providers: [PrismaService],
})
export class TenantsModule {}
