/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import { PrismaClient, Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();
const asDate = (y:number,m:number,d:number) => new Date(Date.UTC(y, m, d));

async function main() {
  const today = new Date();
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();

  // --- CLIENTE ---
  const client = await prisma.client.upsert({
    where: { id: '11111111-1111-4111-8111-111111111111' },
    update: {},
    create: { id: '11111111-1111-4111-8111-111111111111', name: 'Cliente Demo' },
  });

  // --- LOJAS ---
  const lojaA = await prisma.store.upsert({
    where: { id: '22222222-2222-4222-8222-222222222221' },
    update: {},
    create: { id: '22222222-2222-4222-8222-222222222221', name: 'Loja A', clientId: client.id },
  });
  const lojaB = await prisma.store.upsert({
    where: { id: '22222222-2222-4222-8222-222222222222' },
    update: {},
    create: { id: '22222222-2222-4222-8222-222222222222', name: 'Loja B', clientId: client.id },
  });

  // --- EMPREGADOS ---
  const [ana, bruno, carla] = await Promise.all([
    prisma.employee.upsert({ where: { id: '33333333-3333-4333-8333-333333333331' }, update: {}, create: { id: '33333333-3333-4333-8333-333333333331', storeId: lojaA.id, fullName: 'Ana' } }),
    prisma.employee.upsert({ where: { id: '33333333-3333-4333-8333-333333333332' }, update: {}, create: { id: '33333333-3333-4333-8333-333333333332', storeId: lojaA.id, fullName: 'Bruno' } }),
    prisma.employee.upsert({ where: { id: '33333333-3333-4333-8333-333333333333' }, update: {}, create: { id: '33333333-3333-4333-8333-333333333333', storeId: lojaA.id, fullName: 'Carla' } }),
  ]);
  const [davi, eva, fabio] = await Promise.all([
    prisma.employee.upsert({ where: { id: '33333333-3333-4333-8333-333333333334' }, update: {}, create: { id: '33333333-3333-4333-8333-333333333334', storeId: lojaB.id, fullName: 'Davi' } }),
    prisma.employee.upsert({ where: { id: '33333333-3333-4333-8333-333333333335' }, update: {}, create: { id: '33333333-3333-4333-8333-333333333335', storeId: lojaB.id, fullName: 'Eva' } }),
    prisma.employee.upsert({ where: { id: '33333333-3333-4333-8333-333333333336' }, update: {}, create: { id: '33333333-3333-4333-8333-333333333336', storeId: lojaB.id, fullName: 'Fábio' } }),
  ]);

  // --- GOALS ---
  await prisma.goalPolicy.upsert({
    where: { id: '44444444-4444-4444-8444-444444444441' },
    update: {},
    create: { id: '44444444-4444-4444-8444-444444444441', scopeType: 'STORE', scopeId: lojaA.id, metaDaily: new Prisma.Decimal(500), supermetaDaily: new Prisma.Decimal(800), effectiveFrom: asDate(y, m-1, 1) },
  });
  await prisma.goalPolicy.upsert({
    where: { id: '44444444-4444-4444-8444-444444444442' },
    update: {},
    create: { id: '44444444-4444-4444-8444-444444444442', scopeType: 'STORE', scopeId: lojaB.id, metaDaily: new Prisma.Decimal(400), supermetaDaily: new Prisma.Decimal(700), effectiveFrom: asDate(y, m-1, 1) },
  });

  // --- SALES ---
  const mkSale = (storeId:string, empId:string, day:number, amt:number) =>
    prisma.sale.create({
      data: {
        id: crypto.randomUUID(),
        clientId: client.id,
        storeId,
        employeeId: empId,
        saleDate: asDate(y, m, day),
        amount: new Prisma.Decimal(amt),
      },
    });

  await Promise.all([
    mkSale(lojaA.id, ana.id,   1, 300),
    mkSale(lojaA.id, ana.id,   3, 900),
    mkSale(lojaA.id, bruno.id, 2, 200),
    mkSale(lojaB.id, davi.id,  5, 450),
  ]);

  // --- USUÁRIO ADMIN ---
  const adminPwd = await bcrypt.hash('123456', 10);
  await prisma.user.upsert({
    where: { email: 'admin@sistema.com' },
    update: {},
    create: {
      id: '55555555-5555-4555-8555-555555555555',
      email: 'admin@sistema.com',
      passwordHash: adminPwd,
      role: Role.ADMIN,
      fullName: 'Administrador',
      isActive: true,
    },
  });

  console.log('🌱 Seed executado com sucesso!');
}

main().finally(()=>prisma.$disconnect());
