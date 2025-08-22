/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// prisma/seed.ts
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// IDs fixos deixam o seed idempotente
const IDs = {
  admin: '11111111-1111-4111-8111-111111111111',
  client: '22222222-2222-4222-8222-222222222222',
  store: '33333333-3333-4333-8333-333333333333',
  emp: '44444444-4444-4444-8444-444444444444',
  manager: '55555555-5555-4555-8555-555555555555',
};

async function main() {
  // ADMIN
  await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      id: IDs.admin,
      email: 'admin@demo.com',
      passwordHash: await bcrypt.hash('admin123', 10),
      role: 'ADMIN' as Role,
    },
  });

  // CLIENTE
  await prisma.client.upsert({
    where: { id: IDs.client },
    update: { name: 'Cliente Demo' },
    create: { id: IDs.client, name: 'Cliente Demo' },
  });

  // LOJA
  await prisma.store.upsert({
    where: { id: IDs.store },
    update: { name: 'Loja Centro', clientId: IDs.client },
    create: { id: IDs.store, name: 'Loja Centro', clientId: IDs.client },
  });

  // STORE_MANAGER
  await prisma.user.upsert({
    where: { email: 'gerente@demo.com' },
    update: {
      role: 'STORE_MANAGER',
      clientId: IDs.client,
      storeId: IDs.store,
      // manter a senha se já existir; se quiser trocar, descomente a linha abaixo
      // passwordHash: await bcrypt.hash('gerente123', 10),
    },
    create: {
      id: IDs.manager,
      email: 'gerente@demo.com',
      passwordHash: await bcrypt.hash('gerente123', 10),
      role: 'STORE_MANAGER',
      clientId: IDs.client,
      storeId: IDs.store,
    },
  });

  // FUNCIONÁRIO (sem login)
  await prisma.employee.upsert({
    where: { id: IDs.emp },
    update: { fullName: 'Maria Vendedora', storeId: IDs.store },
    create: { id: IDs.emp, fullName: 'Maria Vendedora', storeId: IDs.store },
  });

  // Venda de hoje (evita duplicar)
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const today = new Date(todayStr);

  const exists = await prisma.sale.findFirst({
    where: { employeeId: IDs.emp, saleDate: today },
  });

  if (!exists) {
    await prisma.sale.create({
      data: {
        id: undefined, // deixa o Prisma gerar
        clientId: IDs.client,
        storeId: IDs.store,
        employeeId: IDs.emp,
        saleDate: today,
        amount: 500,
        itemsCount: 3,
        createdBy: IDs.admin,
      },
    });
  }

  console.log('✅ Seed ok');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
