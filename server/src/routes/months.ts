import { Router } from 'express';
import { Prisma, type Month } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { bucketBudget, personContribution, totalIncome } from '../services/distribution';
import { jointSpent, personalSpent } from '../services/spending';

export const monthsRouter = Router();

const { Decimal } = Prisma;

const SPLIT_MODES = ['proportional', 'half'] as const;
const BUCKET_KINDS = ['savings', 'personal', 'shared_expenses', 'other'] as const;

const createMonthSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

const incomesSchema = z.array(
  z.object({
    userId: z.string().uuid(),
    label: z.string().trim().min(1),
    amount: z.union([z.string(), z.number()]),
  }),
);

const monthBucketsSchema = z.array(
  z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1),
    percentage: z.union([z.string(), z.number()]),
    splitMode: z.enum(SPLIT_MODES),
    kind: z.enum(BUCKET_KINDS),
    active: z.boolean(),
  }),
);

function badRequest(res: import('express').Response, code: string, message: string): void {
  res.status(400).json({ error: { code, message } });
}

async function findMonthOr404(res: import('express').Response, id: string): Promise<Month | null> {
  const month = await prisma.month.findUnique({ where: { id } });
  if (!month) {
    res.status(404).json({ error: { code: 'not_found', message: 'Mes no encontrado' } });
    return null;
  }
  return month;
}

monthsRouter.get('/', async (_req, res) => {
  const months = await prisma.month.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    include: { incomes: true },
  });
  res.json({
    months: months.map((m) => ({
      id: m.id,
      year: m.year,
      month: m.month,
      status: m.status,
      totalIncome: totalIncome(m.incomes.map((i) => ({ userId: i.userId, amount: i.amount }))).toString(),
    })),
  });
});

monthsRouter.post('/', async (req, res) => {
  const parsed = createMonthSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const { year, month } = parsed.data;

  const existing = await prisma.month.findUnique({ where: { year_month: { year, month } } });
  if (existing) {
    res.status(409).json({ error: { code: 'month_exists', message: 'Ese mes ya existe' } });
    return;
  }

  const activeBuckets = await prisma.bucket.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });

  const created = await prisma.month.create({
    data: {
      year,
      month,
      monthBuckets: {
        create: activeBuckets.map((bucket) => ({
          bucketId: bucket.id,
          name: bucket.name,
          percentage: bucket.percentage,
          splitMode: bucket.splitMode,
          kind: bucket.kind,
          active: bucket.active,
        })),
      },
    },
    include: { monthBuckets: true },
  });
  res.status(201).json({ month: created });
});

monthsRouter.get('/:id', async (req, res) => {
  const month = await findMonthOr404(res, req.params.id);
  if (!month) return;

  const [incomes, monthBuckets] = await Promise.all([
    prisma.income.findMany({ where: { monthId: month.id } }),
    prisma.monthBucket.findMany({ where: { monthId: month.id } }),
  ]);

  res.json({ month, incomes, monthBuckets });
});

monthsRouter.put('/:id/incomes', async (req, res) => {
  const month = await findMonthOr404(res, req.params.id);
  if (!month) return;
  if (month.status === 'closed') {
    badRequest(res, 'month_closed', 'El mes esta cerrado');
    return;
  }

  const parsed = incomesSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }

  const incomes = await prisma.$transaction(async (tx) => {
    await tx.income.deleteMany({ where: { monthId: month.id } });
    if (parsed.data.length === 0) return [];
    await tx.income.createMany({
      data: parsed.data.map((income) => ({
        monthId: month.id,
        userId: income.userId,
        label: income.label,
        amount: new Decimal(income.amount),
      })),
    });
    return tx.income.findMany({ where: { monthId: month.id } });
  });

  res.json({ incomes });
});

monthsRouter.get('/:id/buckets', async (req, res) => {
  const month = await findMonthOr404(res, req.params.id);
  if (!month) return;
  const monthBuckets = await prisma.monthBucket.findMany({ where: { monthId: month.id } });
  res.json({ monthBuckets });
});

monthsRouter.put('/:id/buckets', async (req, res) => {
  const month = await findMonthOr404(res, req.params.id);
  if (!month) return;
  if (month.status === 'closed') {
    badRequest(res, 'month_closed', 'El mes esta cerrado');
    return;
  }

  const parsed = monthBucketsSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }

  const activeSum = parsed.data
    .filter((b) => b.active)
    .reduce((acc, b) => acc.plus(new Decimal(b.percentage)), new Decimal(0));
  if (!activeSum.equals(100)) {
    badRequest(res, 'buckets_must_sum_100', 'Los rubros activos deben sumar 100%');
    return;
  }

  const monthBuckets = await prisma.$transaction(async (tx) => {
    await tx.monthBucket.deleteMany({ where: { monthId: month.id } });
    await tx.monthBucket.createMany({
      data: parsed.data.map((b) => ({
        monthId: month.id,
        bucketId: null,
        name: b.name,
        percentage: new Decimal(b.percentage),
        splitMode: b.splitMode,
        kind: b.kind,
        active: b.active,
      })),
    });
    return tx.monthBucket.findMany({ where: { monthId: month.id } });
  });

  res.json({ monthBuckets });
});

monthsRouter.get('/:id/summary', async (req, res) => {
  const month = await findMonthOr404(res, req.params.id);
  if (!month) return;

  const [incomes, monthBuckets, quickEntries, transactions] = await Promise.all([
    prisma.income.findMany({ where: { monthId: month.id } }),
    prisma.monthBucket.findMany({ where: { monthId: month.id, active: true } }),
    prisma.quickEntry.findMany({ where: { monthId: month.id } }),
    prisma.transaction.findMany({ where: { monthId: month.id, type: { in: ['personal', 'joint'] } } }),
  ]);

  const total = totalIncome(incomes.map((i) => ({ userId: i.userId, amount: i.amount })));
  // Gastado = quick_entries no-matched (Fase 2) + transactions personal/joint (Fase 3). Un
  // quick_entry matched ya no cuenta aqui (countableAmount lo excluye) porque su transaction
  // asociada si esta en esta lista — evita doble conteo (RF3/RF5).
  const spendingEntries = [
    ...quickEntries.map((entry) => ({
      userId: entry.userId,
      amount: entry.amount,
      type: entry.type,
      status: entry.status,
    })),
    ...transactions.map((tx) => ({
      userId: tx.ownerUserId,
      amount: tx.amount,
      type: tx.type as 'personal' | 'joint',
    })),
  ];

  const buckets = monthBuckets.map((bucket) => {
    const budget = bucketBudget(bucket, total);
    const contributions = incomes.map((income) => {
      const spent = bucket.kind === 'personal' ? personalSpent(spendingEntries, income.userId) : null;
      return {
        userId: income.userId,
        amount: personContribution(bucket, budget, income.amount, total).toString(),
        ...(spent ? { spent: spent.toString() } : {}),
      };
    });

    const spent =
      bucket.kind === 'shared_expenses'
        ? jointSpent(spendingEntries)
        : bucket.kind === 'personal'
          ? incomes.reduce((sum, income) => sum.plus(personalSpent(spendingEntries, income.userId)), budget.mul(0))
          : budget.mul(0); // 0 con la misma precision que budget (savings/other no trackean gasto)

    return {
      id: bucket.id,
      name: bucket.name,
      kind: bucket.kind,
      splitMode: bucket.splitMode,
      percentage: bucket.percentage.toString(),
      budget: budget.toString(),
      spent: spent.toString(),
      available: budget.minus(spent).toString(),
      contributions,
    };
  });

  res.json({
    month: { id: month.id, year: month.year, month: month.month, status: month.status },
    totalIncome: total.toString(),
    buckets,
  });
});
