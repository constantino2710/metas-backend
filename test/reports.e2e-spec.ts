/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { ReportsModule } from '../src/reports/reports.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/rbac/roles.guard';
import { PrismaService } from '../src/database/prisma.service';
import { GoalResolverService } from '../src/goals/goal-resolver.service';
import { GoalScope } from '@prisma/client';

function buildApp(user: any): Promise<INestApplication> {
  const prismaMock = {
    sale: {
      groupBy: jest.fn().mockResolvedValue([
        { saleDate: new Date('2023-01-01'), _sum: { amount: 50 } },
        { saleDate: new Date('2023-01-02'), _sum: { amount: 70 } },
      ]),
    },
    store: {
      findUnique: jest.fn(({ where: { id } }: any) => {
        if (id === 'store1') return { id: 'store1', clientId: 'client1' };
        return null;
      }),
    },
    employee: {
      findUnique: jest.fn(({ where: { id } }: any) => {
        if (id === 'emp1')
          return {
            id: 'emp1',
            storeId: 'store1',
            store: { clientId: 'client1' },
          };
        return null;
      }),
    },
  } as unknown as PrismaService;

  const goalResolverMock = {
    resolve: jest.fn(({ date }: any) => {
      const iso = date.toISOString().slice(0, 10);
      if (iso < '2023-01-02') return { goal: 100, superGoal: 130 };
      return { goal: 200, superGoal: 260 };
    }),
  } as unknown as GoalResolverService;

  const mockJwt = {
    canActivate: (ctx: ExecutionContext) => {
      const req = ctx.switchToHttp().getRequest();
      req.user = user;
      return true;
    },
  };

  return Test.createTestingModule({
    imports: [ReportsModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .overrideProvider(GoalResolverService)
    .useValue(goalResolverMock)
    .overrideGuard(RolesGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(JwtAuthGuard)
    .useValue(mockJwt)
    .compile()
    .then((m: TestingModule) => {
      const app = m.createNestApplication();
      return app.init().then(() => app);
    });
}

describe('ReportsController (e2e)', () => {
  it('CLIENT scope', async () => {
    const app = await buildApp({
      id: 'u1',
      sub: 'u1',
      email: 'a@a',
      role: 'CLIENT_ADMIN',
      clientId: 'client1',
    });
    const res = await request(app.getHttpServer())
      .get('/reports/goals-vs-sales')
      .query({
        from: '2023-01-01',
        to: '2023-01-02',
        scopeType: GoalScope.CLIENT,
        scopeId: 'client1',
        granularity: 'daily',
      })
      .expect(200);
    expect(res.body).toEqual({
      series: [
        { date: '2023-01-01', realized: 50, goal: 100, superGoal: 130 },
        { date: '2023-01-02', realized: 70, goal: 200, superGoal: 260 },
      ],
      totals: { realized: 120, goal: 300, superGoal: 390 },
    });
    await app.close();
  });

  it('STORE scope', async () => {
    const app = await buildApp({
      id: 'u2',
      sub: 'u2',
      email: 'b@b',
      role: 'STORE_MANAGER',
      clientId: 'client1',
      storeId: 'store1',
    });
    const res = await request(app.getHttpServer())
      .get('/reports/goals-vs-sales')
      .query({
        from: '2023-01-01',
        to: '2023-01-02',
        scopeType: GoalScope.STORE,
        scopeId: 'store1',
        granularity: 'daily',
      })
      .expect(200);
    expect(res.body.series).toHaveLength(2);
    await app.close();
  });

  it('EMPLOYEE scope', async () => {
    const app = await buildApp({
      id: 'u3',
      sub: 'u3',
      email: 'c@c',
      role: 'STORE_MANAGER',
      clientId: 'client1',
      storeId: 'store1',
    });
    const res = await request(app.getHttpServer())
      .get('/reports/goals-vs-sales')
      .query({
        from: '2023-01-01',
        to: '2023-01-02',
        scopeType: GoalScope.EMPLOYEE,
        scopeId: 'emp1',
        granularity: 'daily',
      })
      .expect(200);
    expect(res.body.series).toHaveLength(2);
    await app.close();
  });
});
