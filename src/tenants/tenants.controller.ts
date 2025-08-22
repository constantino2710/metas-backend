/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUser } from '../auth/types';
import { CreateClientDto } from './dtos/create-client.dto';
import { CreateStoreDto } from './dtos/create-store.dto';
import { ListStoresQueryDto } from './dtos/list-stores.query.dto';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard) // se seus guards são globais, pode remover
@Controller()
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  // ----- Clients -----
  @Get('clients')
  @Roles('ADMIN', 'CLIENT_ADMIN')
  listClients(@CurrentUser() user: JwtUser) {
    return this.tenants.listClients(user);
  }

  @Post('clients')
  @Roles('ADMIN')
  createClient(@CurrentUser() user: JwtUser, @Body() dto: CreateClientDto) {
    return this.tenants.createClient(user, dto);
  }

  // ----- Stores -----
  @Get('stores')
  @Roles('ADMIN', 'CLIENT_ADMIN', 'STORE_MANAGER')
  listStores(@CurrentUser() user: JwtUser, @Query() q: ListStoresQueryDto) {
    return this.tenants.listStores(user, { clientId: q.clientId });
  }

  @Post('stores')
  @Roles('ADMIN', 'CLIENT_ADMIN')
  createStore(@CurrentUser() user: JwtUser, @Body() dto: CreateStoreDto) {
    return this.tenants.createStore(user, dto);
  }
}
