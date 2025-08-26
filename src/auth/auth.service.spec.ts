/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';

describe('AuthService login', () => {
  it('includes clientId in JWT for client_admin', async () => {
    const passwordHash = await bcrypt.hash('pass123', 10);
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'client@demo.com',
          passwordHash,
          role: 'CLIENT_ADMIN',
          clientId: 'c1',
          storeId: null,
          isActive: true,
        }),
      },
    } as unknown as PrismaService;

    const cfg = new ConfigService({
      JWT_SECRET: 'secret',
      JWT_EXPIRES_IN: '1h',
      REFRESH_SECRET: 'refreshSecret',
      REFRESH_EXPIRES_IN: '7d',
    });
    const jwt = new JwtService();
    const service = new AuthService(prisma, jwt, cfg);

    const res = await service.login({
      email: 'client@demo.com',
      password: 'pass123',
    });
    const decoded = jwt.decode(res.accessToken) as Record<
      string,
      unknown
    > | null;
    expect((decoded as any)?.clientId).toBe('c1');
  });

  it('omits clientId in JWT when null', async () => {
    const passwordHash = await bcrypt.hash('pass123', 10);
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u2',
          email: 'admin@demo.com',
          passwordHash,
          role: 'ADMIN',
          clientId: null,
          storeId: null,
          isActive: true,
        }),
      },
    } as unknown as PrismaService;

    const cfg = new ConfigService({
      JWT_SECRET: 'secret',
      JWT_EXPIRES_IN: '1h',
      REFRESH_SECRET: 'refreshSecret',
      REFRESH_EXPIRES_IN: '7d',
    });
    const jwt = new JwtService();
    const service = new AuthService(prisma, jwt, cfg);

    const res = await service.login({
      email: 'admin@demo.com',
      password: 'pass123',
    });
    const decoded = jwt.decode(res.accessToken) as Record<
      string,
      unknown
    > | null;
    expect((decoded as any)?.clientId).toBeUndefined();
  });
});