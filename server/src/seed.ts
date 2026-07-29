import 'dotenv/config';
import { prisma } from './lib/prisma';

const SEED_USERS = [
  { name: 'John', email: 'jhond5@gmail.com' },
  { name: 'Lina', email: 'lina.tic.isc@gmail.com' },
];

async function main(): Promise<void> {
  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name },
      create: user,
    });
  }
  console.log('Seed completado: John y Lina');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
