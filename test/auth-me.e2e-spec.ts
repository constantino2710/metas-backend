import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthModule } from '../src/auth/auth.module';
import { PrismaService } from '../src/database/prisma.service';
import { Role } from '../src/auth/types';

class PrismaStub {
  onModuleInit = jest.fn();
  enableShutdownHooks = jest.fn();
}

describe('Auth /me guard behaviour (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new PrismaStub())
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    jwt = new JwtService({ secret: process.env.JWT_SECRET });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the user payload when the access token is valid', async () => {
    const token = await jwt.signAsync({
      sub: 'user-1',
      role: Role.ADMIN,
      clientId: null,
      storeId: null,
    });

    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: 'user-1',
        role: Role.ADMIN,
        clientId: null,
        storeId: null,
      }),
    );
  });

  it('returns 401 with a specific message when the token is expired', async () => {
    const expiredToken = await jwt.signAsync(
      {
        sub: 'user-1',
        role: Role.ADMIN,
      },
      { expiresIn: -10 },
    );

    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      message: 'Access token expirado',
      error: 'Unauthorized',
    });
  });

  it('returns 401 with a helpful message when the token is missing', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      message: 'Access token ausente',
      error: 'Unauthorized',
    });
  });
});
