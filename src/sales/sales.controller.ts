/* eslint-disable prettier/prettier */
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesDailyQueryDto, SalesDailyScope } from './dtos/sales-daily.query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as types from '../auth/types';
import { Roles } from '../auth/roles.decorator';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('daily')
  @Roles(types.Role.ADMIN, types.Role.CLIENT_ADMIN, types.Role.STORE_MANAGER)
  async daily(@CurrentUser() user: types.JwtUser, @Query() q: SalesDailyQueryDto) {
    if (q.scope !== SalesDailyScope.SYSTEM && !q.id) {
      throw new BadRequestException('id é obrigatório para esse escopo');
    }
    if (!q.start && !q.end) {
      throw new BadRequestException('Informe start e/ou end (YYYY-MM-DD)');
    }

    if (!q.start && q.end) {
      const d = new Date(q.end + 'T00:00:00Z');
      if (Number.isNaN(+d)) throw new BadRequestException('end inválido');
      const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      q.start = start.toISOString().slice(0, 10);
    }
    if (q.start && !q.end) {
      const d = new Date(q.start + 'T00:00:00Z');
      if (Number.isNaN(+d)) throw new BadRequestException('start inválido');
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      q.end = end.toISOString().slice(0, 10);
    }

    const s = new Date(q.start! + 'T00:00:00Z');
    const e = new Date(q.end! + 'T23:59:59Z');
    if (Number.isNaN(+s) || Number.isNaN(+e) || s > e) {
      throw new BadRequestException('Intervalo de datas inválido');
    }

    return this.sales.daily(user, q);
  }
}
