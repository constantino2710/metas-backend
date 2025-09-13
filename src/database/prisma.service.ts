/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
// src/database/prisma.service.ts
/* eslint-disable @typescript-eslint/no-misused-promises */
import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private _sector: any;
  public get sector(): any {
    return this._sector;
  }
  public set sector(value: any) {
    this._sector = value;
  }
  async onModuleInit() {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    // encerra a app ao receber sinais do SO
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const sig of signals) {
      process.on(sig, async () => {
        await app.close();
        process.exit(0);
      });
    }
    // se quiser também o ciclo do event loop:
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}
