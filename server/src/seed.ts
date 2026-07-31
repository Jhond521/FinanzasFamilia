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

// Categorias de gasto, configurables pero fijas por ahora (docs/01-prd.md RF5).
const SEED_CATEGORIES = [
  'Hogar',
  'Transporte',
  'Restaurante',
  'Mercado',
  'Servicios',
  'Entretenimiento',
  'Salud',
  'Suscripciones',
  'Otros',
] as const;

// Reglas semilla del motor de clasificacion (docs/01-prd.md RF5). `mode` es 'auto' salvo
// donde el PRD marca explicitamente "(sugerir)". FRISBY/RESTAURANT/BOLD SA*/RELLENITAS no traen
// tipo explicito en el PRD (solo categoria) — se asume 'joint' como sugerencia razonable (salidas
// a comer suelen ser conjuntas en esta pareja), pero al ser 'suggest' el usuario siempre confirma.
// El patron de la tarjeta Nu tampoco viene con el texto exacto del extracto — "TARJETA NU" es un
// supuesto a ajustar cuando aparezca un extracto real con el pago de la tarjeta.
const SEED_RULES = [
  { pattern: 'CARULLA', setType: 'joint', category: 'Mercado', mode: 'auto' },
  { pattern: 'TIENDA D1', setType: 'joint', category: 'Mercado', mode: 'auto' },
  { pattern: 'LA COLECTA', setType: 'joint', category: 'Mercado', mode: 'auto' },
  { pattern: 'EL PALACIO', setType: 'joint', category: 'Mercado', mode: 'auto' },
  { pattern: 'CERVALLE', setType: 'joint', category: 'Mercado', mode: 'auto' },
  { pattern: 'AGUAS Y AGUAS', setType: 'joint', category: 'Servicios', mode: 'auto' },
  { pattern: 'EMPRESA DE ACUEDUCT', setType: 'joint', category: 'Servicios', mode: 'auto' },
  { pattern: 'EMPRESA DE ENERGIA', setType: 'joint', category: 'Servicios', mode: 'auto' },
  { pattern: 'EFIGAS', setType: 'joint', category: 'Servicios', mode: 'auto' },
  { pattern: 'PEXTO', setType: 'joint', category: 'Servicios', detail: 'Celulares e internet', mode: 'auto' },
  { pattern: 'MOVISTAR', setType: 'joint', category: 'Servicios', detail: 'Celulares e internet', mode: 'auto' },
  { pattern: 'EDS', setType: 'joint', category: 'Transporte', detail: 'Gasolina', mode: 'auto' },
  { pattern: 'BIOMAX', setType: 'joint', category: 'Transporte', detail: 'Gasolina', mode: 'auto' },
  { pattern: 'DROGUERIA', setType: 'joint', category: 'Salud', detail: 'Farmacia', mode: 'auto' },
  { pattern: 'FARMACIA', setType: 'joint', category: 'Salud', detail: 'Farmacia', mode: 'auto' },
  { pattern: 'MULTIDROGA', setType: 'joint', category: 'Salud', detail: 'Farmacia', mode: 'auto' },
  { pattern: 'DLO*Netfli', setType: 'joint', category: 'Suscripciones', mode: 'auto' },
  { pattern: 'PRIME', setType: 'joint', category: 'Suscripciones', mode: 'auto' },
  { pattern: 'FRISBY', setType: 'joint', category: 'Restaurante', mode: 'suggest' },
  { pattern: 'RESTAURANT', setType: 'joint', category: 'Restaurante', mode: 'suggest' },
  { pattern: 'BOLD SA*', setType: 'joint', category: 'Restaurante', mode: 'suggest' },
  { pattern: 'RELLENITAS', setType: 'joint', category: 'Restaurante', mode: 'suggest' },
  { pattern: 'PAGO CARTERA HIP', setType: 'joint', category: 'Hogar', detail: 'Hipoteca', mode: 'auto' },
  { pattern: 'ABONO INTERESES AHORROS', setType: 'personal', category: 'Otros', detail: 'Intereses', mode: 'auto' },
  { pattern: 'PAGO DE NOMI', setType: 'movement', category: null, mode: 'auto' },
  { pattern: 'PAGO INTERBANC SISTEMAS', setType: 'movement', category: null, mode: 'auto' },
  { pattern: 'PAGO SMARTFIT', setType: 'personal', category: 'Salud', detail: 'Gimnasio', mode: 'auto' },
  { pattern: 'TARJETA NU', setType: 'movement', category: null, mode: 'auto' },
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

  const categoryIds = new Map<string, string>();
  for (const [index, name] of SEED_CATEGORIES.entries()) {
    const existing = await prisma.category.findFirst({ where: { name } });
    const category = existing
      ? await prisma.category.update({ where: { id: existing.id }, data: { sortOrder: index } })
      : await prisma.category.create({ data: { name, sortOrder: index } });
    categoryIds.set(name, category.id);
  }
  console.log(`Seed completado: ${SEED_CATEGORIES.length} categorias`);

  for (const rule of SEED_RULES) {
    const data = {
      pattern: rule.pattern,
      setType: rule.setType,
      setCategoryId: rule.category ? categoryIds.get(rule.category) : null,
      setDetail: 'detail' in rule ? rule.detail : null,
      mode: rule.mode,
      createdFrom: 'seed' as const,
    };
    const existing = await prisma.rule.findFirst({ where: { pattern: rule.pattern, createdFrom: 'seed' } });
    if (existing) {
      await prisma.rule.update({ where: { id: existing.id }, data });
    } else {
      await prisma.rule.create({ data });
    }
  }
  console.log(`Seed completado: ${SEED_RULES.length} reglas semilla (RF5)`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
