import 'dotenv/config';
import { prisma } from './lib/prisma';

const SEED_USERS = [
  { name: 'John', email: 'jhond5@gmail.com' },
  { name: 'Lina', email: 'lina.tic.isc@gmail.com' },
];

// Configuracion vigente segun docs/01-prd.md RF2.
const SEED_BUCKETS = [
  { name: 'Ahorros Conjuntos', percentage: '36.00', splitMode: 'proportional', kind: 'savings', active: true, sortOrder: 0 },
  { name: 'Dinero Personal', percentage: '16.00', splitMode: 'half', kind: 'personal', active: true, sortOrder: 1 },
  { name: 'Ayuda Familia', percentage: '0.00', splitMode: 'proportional', kind: 'other', active: false, sortOrder: 2 },
  { name: 'Gastos del Mes', percentage: '48.00', splitMode: 'proportional', kind: 'shared_expenses', active: true, sortOrder: 3 },
] as const;

async function main(): Promise<void> {
  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name },
      create: user,
    });
  }
  console.log('Seed completado: John y Lina');

  for (const bucket of SEED_BUCKETS) {
    const existing = await prisma.bucket.findFirst({ where: { name: bucket.name } });
    if (existing) {
      await prisma.bucket.update({ where: { id: existing.id }, data: bucket });
    } else {
      await prisma.bucket.create({ data: bucket });
    }
  }
  console.log('Seed completado: rubros (Ahorros Conjuntos, Dinero Personal, Ayuda Familia, Gastos del Mes)');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
