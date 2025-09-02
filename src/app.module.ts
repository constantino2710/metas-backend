import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { SalesModule } from './sales/sales.module';
import { UsersModule } from './users/users.module';
import { EmployeesModule } from './employees/employees.module';
import { GoalsModule } from './goals/goals.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    ReportsModule,
    GoalsModule,
    EmployeesModule,
    UsersModule,
    TenantsModule,
    SalesModule,
  ],
})
export class AppModule {}
