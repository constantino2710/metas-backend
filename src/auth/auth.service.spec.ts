/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/unbound-method */
const sendMail = jest.fn();
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail }) }), { virtual: true });

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

describe('AuthService password reset', () => {
  it('generates token and stores hash/expiry and sends email', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@a.com' }),
        update: jest.fn(),
      },
    } as unknown as PrismaService;

    const cfg = new ConfigService({
      SMTP_HOST: 'smtp',
      SMTP_PORT: '25',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
      RESET_PASSWORD_URL: 'http://example.com/reset',
    });

    const service = new AuthService(prisma, new JwtService(), cfg);
    await service.requestPasswordReset('a@a.com');

    expect(prisma.user.update).toHaveBeenCalled();
    const data = (prisma.user.update as any).mock.calls[0][0].data;
    expect(data.resetTokenHash).toBeDefined();
    expect(data.resetTokenExpires).toBeInstanceOf(Date);
    expect(sendMail).toHaveBeenCalled();
  });

  it('resets password when token valid', async () => {
    const token = 'abc123';
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'u1' }),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const cfg = new ConfigService({});
    const service = new AuthService(prisma, new JwtService(), cfg);
    await service.resetPassword(token, 'newpass');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        passwordHash: expect.any(String),
        resetTokenHash: null,
        resetTokenExpires: null,
      },
    });
  });
});