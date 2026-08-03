import { Router } from 'express';
import { Prisma, type Bucket, type Month } from '@prisma/client';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { toDateOnly } from '../lib/dates';
import { bucketBudget, personContribution, totalIncome } from '../services/distribution';
import { jointSpent, personalSpent } from '../services/spending';
import { leaveInAccount, realSavingsContribution, sharedExpensesExcess } from '../services/summary';
import {
  accountBalanceMatches,
  expensesToDate,
  leaveInAccountAtOpening,
  moveToSavingsFromBalance,
} from '../services/openingReconciliation';
import { buildMonthExportWorkbook } from '../services/monthExport';

export const monthsRouter = Router();

const { Decimal } = Prisma;
type Decimal = InstanceType<typeof Prisma.Decimal>;

const SPLIT_MODES = ['proportional', 'half'] as const;
const BUCKET_KINDS = ['savings', 'personal', 'shared_expenses', 'other'] as const;

const EXPORT_TYPE_LABEL: Record<string, string> = {
  personal: 'Personal',
  joint: 'Conjunto',
  movement: 'Movimiento',
  unclassified: 'Sin clasificar',
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

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

const openingReconciliationCreateSchema = z.object({
  userId: z.string().uuid().optional(),
  // Saldo antes de hacer la transferencia -- se usa para calcular cuanto mover a Nu (ticket #31).
  accountBalance: z.union([z.string(), z.number()]),
  // Saldo despues de hacer la transferencia -- se compara contra "dejar en cuenta" para el match.
  confirmedBalance: z.union([z.string(), z.number()]),
});

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

/** Snapshot de monthBuckets a partir de los buckets generales activos (RF2) — usado al crear
 * un mes (POST /) y al crear el mes siguiente al cerrar (POST /:id/close). */
function activeBucketsSnapshotData(activeBuckets: Bucket[]) {
  return activeBuckets.map((bucket) => ({
    bucketId: bucket.id,
    name: bucket.name,
    percentage: bucket.percentage,
    splitMode: bucket.splitMode,
    kind: bucket.kind,
    active: bucket.active,
  }));
}

function nextYearMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * Calcula el summary completo de un mes (presupuesto/gastado/disponible por bolsa + ahorro
 * real/dejar en cuenta por persona). Usado tanto por GET /:id/summary (mes abierto, en vivo)
 * como por POST /:id/close (para congelar el snapshot en month_summaries).
 */
async function buildLiveSummary(month: Month) {
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

  // Acumuladores por persona/kind para el bloque de cierre (ahorro real / dejar en cuenta),
  // aparte de las bolsas del bloque `buckets` que ya se devolvia antes de este ticket.
  const savingsByUser = new Map<string, Decimal>();
  const sharedByUser = new Map<string, Decimal>();
  const personalByUser = new Map<string, Decimal>();
  let sharedBudgetTotal = new Decimal(0);
  let sharedSpentTotal = new Decimal(0);

  const buckets = monthBuckets.map((bucket) => {
    const budget = bucketBudget(bucket, total);
    const contributions = incomes.map((income) => {
      const spent = bucket.kind === 'personal' ? personalSpent(spendingEntries, income.userId) : null;
      const amount = personContribution(bucket, budget, income.amount, total);

      const byUser =
        bucket.kind === 'savings' ? savingsByUser : bucket.kind === 'shared_expenses' ? sharedByUser : bucket.kind === 'personal' ? personalByUser : null;
      if (byUser) {
        byUser.set(income.userId, (byUser.get(income.userId) ?? new Decimal(0)).plus(amount));
      }

      return {
        userId: income.userId,
        amount: amount.toString(),
        ...(spent ? { spent: spent.toString() } : {}),
      };
    });

    const spent =
      bucket.kind === 'shared_expenses'
        ? jointSpent(spendingEntries)
        : bucket.kind === 'personal'
          ? incomes.reduce((sum, income) => sum.plus(personalSpent(spendingEntries, income.userId)), budget.mul(0))
          : budget.mul(0); // 0 con la misma precision que budget (savings/other no trackean gasto)

    if (bucket.kind === 'shared_expenses') {
      sharedBudgetTotal = sharedBudgetTotal.plus(budget);
      sharedSpentTotal = spent; // jointSpent ya es el total conjunto, no depende del bucket puntual
    }

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

  const excess = sharedExpensesExcess(sharedBudgetTotal, sharedSpentTotal);
  const perPerson = incomes.map((income) => {
    const savingsContribution = savingsByUser.get(income.userId) ?? new Decimal(0);
    const sharedContribution = sharedByUser.get(income.userId) ?? new Decimal(0);
    const personalContributionAmount = personalByUser.get(income.userId) ?? new Decimal(0);
    return {
      userId: income.userId,
      realSavings: realSavingsContribution(savingsContribution, income.amount, total, excess).toString(),
      leaveInAccount: leaveInAccount(sharedContribution, personalContributionAmount).toString(),
    };
  });

  return {
    month: { id: month.id, year: month.year, month: month.month, status: month.status },
    totalIncome: total.toString(),
    buckets,
    close: {
      sharedExpensesExcess: excess.toString(),
      perPerson,
    },
  };
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
      monthBuckets: { create: activeBucketsSnapshotData(activeBuckets) },
    },
    include: { monthBuckets: true },
  });
  res.status(201).json({ month: created });
});

// Comparativo mes a mes (RF7): cifras congeladas de los meses ya cerrados. Ruta literal
// registrada antes de `/:id` para que Express no la confunda con un id de mes.
monthsRouter.get('/comparison', async (_req, res) => {
  const summaries = await prisma.monthSummary.findMany({
    include: { month: true },
    orderBy: [{ month: { year: 'desc' } }, { month: { month: 'desc' } }],
  });
  res.json({
    months: summaries.map((s) => {
      // El snapshot (s.data) ya trae su propio campo `month` (objeto id/year/month/status) --
      // no se spreadea entero para no pisar los `year`/`month` (numeros) de este endpoint.
      const data = s.data as { totalIncome: string; buckets: unknown[]; close: unknown };
      return {
        monthId: s.monthId,
        year: s.month.year,
        month: s.month.month,
        totalIncome: data.totalIncome,
        buckets: data.buckets,
        close: data.close,
      };
    }),
  });
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

  if (month.status === 'closed') {
    const frozen = await prisma.monthSummary.findUnique({ where: { monthId: month.id } });
    if (frozen) {
      res.json(frozen.data);
      return;
    }
    // Defensivo: un mes cerrado deberia tener siempre su snapshot (lo crea POST /:id/close).
    // Si por algun motivo no existe, se recalcula en vivo en vez de fallar.
  }

  const summary = await buildLiveSummary(month);
  res.json(summary);
});

monthsRouter.post('/:id/close', async (req, res) => {
  const month = await findMonthOr404(res, req.params.id);
  if (!month) return;
  if (month.status === 'closed') {
    badRequest(res, 'month_closed', 'El mes ya esta cerrado');
    return;
  }

  const summary = await buildLiveSummary(month);
  // El summary se calculo con el mes todavia 'open' (findMonthOr404 lo trajo antes de cerrar);
  // se corrige aqui para que el snapshot congelado no quede con un status desactualizado.
  summary.month.status = 'closed';
  const next = nextYearMonth(month.year, month.month);
  const activeBuckets = await prisma.bucket.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });

  const closedMonth = await prisma.$transaction(async (tx) => {
    const updated = await tx.month.update({
      where: { id: month.id },
      data: { status: 'closed', closedAt: new Date() },
    });
    await tx.monthSummary.upsert({
      where: { monthId: month.id },
      create: { monthId: month.id, data: summary as unknown as Prisma.InputJsonValue },
      update: { data: summary as unknown as Prisma.InputJsonValue },
    });

    const existingNext = await tx.month.findUnique({ where: { year_month: next } });
    if (!existingNext) {
      await tx.month.create({
        data: {
          year: next.year,
          month: next.month,
          monthBuckets: { create: activeBucketsSnapshotData(activeBuckets) },
        },
      });
    }

    return updated;
  });

  res.json({ month: closedMonth, summary });
});

monthsRouter.post('/:id/reopen', async (req, res) => {
  const month = await findMonthOr404(res, req.params.id);
  if (!month) return;
  if (month.status === 'open') {
    badRequest(res, 'month_open', 'El mes ya esta abierto');
    return;
  }

  const reopened = await prisma.month.update({
    where: { id: month.id },
    data: { status: 'open', closedAt: null },
  });
  res.json({ month: reopened });
});

monthsRouter.get('/:id/export', async (req, res) => {
  const month = await findMonthOr404(res, req.params.id);
  if (!month) return;

  type SummaryData = Awaited<ReturnType<typeof buildLiveSummary>>;
  let summary: SummaryData;
  if (month.status === 'closed') {
    const frozen = await prisma.monthSummary.findUnique({ where: { monthId: month.id } });
    summary = frozen ? (frozen.data as unknown as SummaryData) : await buildLiveSummary(month);
  } else {
    summary = await buildLiveSummary(month);
  }

  const [users, transactions] = await Promise.all([
    prisma.user.findMany(),
    prisma.transaction.findMany({
      where: { monthId: month.id },
      include: { owner: true, category: true },
      orderBy: { date: 'asc' },
    }),
  ]);
  const userName = (userId: string) => users.find((u) => u.id === userId)?.name ?? userId;

  const workbook = buildMonthExportWorkbook({
    monthLabel: `${MESES[month.month - 1]} ${month.year}`,
    totalIncome: summary.totalIncome,
    buckets: summary.buckets.map((bucket) => ({
      name: bucket.name,
      percentage: bucket.percentage,
      budget: bucket.budget,
      spent: bucket.spent,
      available: bucket.available,
      contributions: bucket.contributions.map((c) => ({ userName: userName(c.userId), amount: c.amount })),
    })),
    sharedExpensesExcess: summary.close.sharedExpensesExcess,
    perPersonClose: summary.close.perPerson.map((p) => ({
      userName: userName(p.userId),
      realSavings: p.realSavings,
      leaveInAccount: p.leaveInAccount,
    })),
    transactions: transactions.map((tx) => ({
      date: toDateOnly(tx.date),
      ownerName: tx.owner.name,
      bankDescription: tx.bankDescription,
      detail: tx.detail,
      typeLabel: EXPORT_TYPE_LABEL[tx.type] ?? tx.type,
      categoryName: tx.category?.name ?? null,
      amount: tx.amount.toString(),
    })),
  });

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const filename = `finanzas-${month.year}-${String(month.month).padStart(2, '0')}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

// ---- Cuadre de Inicio (ticket #29, formula corregida en #31) ----

/**
 * Cifras del Cuadre de Inicio para una persona: aporte del mes a Gastos del Mes/Ahorros
 * Conjuntos/Dinero Personal (via el mismo summary que ya usa el dashboard, solo informativo) +
 * lo que ya salio de su cuenta este mes (todas sus transactions, clasificadas o no -- solo se
 * excluye 'movement', ver notas tecnicas del ticket #31). "Mover a Nu" se calcula contra el
 * saldo actual que digita el usuario, para que el cuadre de exacto sin importar remanentes de
 * meses anteriores ni el gap estructural de un bucket 'mitad_y_mitad' con ingresos desiguales.
 */
async function computeOpeningNumbers(month: Month, userId: string, accountBalance: string | number | Decimal) {
  const summary = await buildLiveSummary(month);
  const contributionByKind = (kind: string) =>
    summary.buckets
      .filter((bucket) => bucket.kind === kind)
      .reduce(
        (sum, bucket) => sum.plus(new Decimal(bucket.contributions.find((c) => c.userId === userId)?.amount ?? '0')),
        new Decimal(0),
      );

  const totalSharedExpenses = contributionByKind('shared_expenses');
  const totalSavings = contributionByKind('savings');
  const totalPersonal = contributionByKind('personal');

  const ownedTransactions = await prisma.transaction.findMany({
    where: { monthId: month.id, ownerUserId: userId, type: { not: 'movement' } },
  });
  const expensesToDateAmount = expensesToDate(
    ownedTransactions.map((tx) => ({ amount: tx.amount, type: tx.type as 'personal' | 'joint' | 'unclassified' })),
  );

  const leaveInAccount = leaveInAccountAtOpening(totalSharedExpenses, totalPersonal, expensesToDateAmount);

  return {
    totalSharedExpenses,
    totalSavings,
    totalPersonal,
    expensesToDateAmount,
    leaveInAccount,
    moveToSavings: moveToSavingsFromBalance(accountBalance, leaveInAccount),
  };
}

monthsRouter.get('/:id/opening-reconciliation/preview', async (req, res) => {
  const month = await findMonthOr404(res, req.params.id);
  if (!month) return;
  const userId = typeof req.query.userId === 'string' ? req.query.userId : req.user!.id;
  const { accountBalance } = req.query;
  if (typeof accountBalance !== 'string' || !accountBalance) {
    badRequest(res, 'invalid_query', 'accountBalance es requerido');
    return;
  }

  const numbers = await computeOpeningNumbers(month, userId, accountBalance);
  res.json({
    userId,
    totalSharedExpenses: numbers.totalSharedExpenses.toString(),
    totalSavings: numbers.totalSavings.toString(),
    totalPersonal: numbers.totalPersonal.toString(),
    expensesToDate: numbers.expensesToDateAmount.toString(),
    leaveInAccount: numbers.leaveInAccount.toString(),
    moveToSavings: numbers.moveToSavings.toString(),
  });
});

monthsRouter.get('/:id/opening-reconciliation/latest', async (req, res) => {
  const month = await findMonthOr404(res, req.params.id);
  if (!month) return;
  const userId = typeof req.query.userId === 'string' ? req.query.userId : req.user!.id;

  const latest = await prisma.openingReconciliation.findFirst({
    where: { monthId: month.id, userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    openingReconciliation: latest
      ? {
          id: latest.id,
          monthId: latest.monthId,
          userId: latest.userId,
          accountBalance: latest.accountBalance.toString(),
          expensesToDate: latest.expensesToDate.toString(),
          leaveInAccount: latest.leaveInAccount.toString(),
          moveToSavings: latest.moveToSavings.toString(),
          matched: latest.matched,
          createdAt: latest.createdAt,
        }
      : null,
  });
});

monthsRouter.post('/:id/opening-reconciliation', async (req, res) => {
  const month = await findMonthOr404(res, req.params.id);
  if (!month) return;

  const parsed = openingReconciliationCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const userId = parsed.data.userId ?? req.user!.id;
  const confirmedBalance = new Decimal(parsed.data.confirmedBalance);

  const numbers = await computeOpeningNumbers(month, userId, parsed.data.accountBalance);
  const matched = accountBalanceMatches(confirmedBalance, numbers.leaveInAccount);

  const created = await prisma.openingReconciliation.create({
    data: {
      monthId: month.id,
      userId,
      accountBalance: confirmedBalance,
      expensesToDate: numbers.expensesToDateAmount,
      leaveInAccount: numbers.leaveInAccount,
      moveToSavings: numbers.moveToSavings,
      matched,
    },
  });

  res.status(201).json({
    openingReconciliation: {
      id: created.id,
      monthId: created.monthId,
      userId: created.userId,
      accountBalance: created.accountBalance.toString(),
      expensesToDate: created.expensesToDate.toString(),
      leaveInAccount: created.leaveInAccount.toString(),
      moveToSavings: created.moveToSavings.toString(),
      matched: created.matched,
      createdAt: created.createdAt,
    },
    diff: confirmedBalance.minus(numbers.leaveInAccount).toString(),
  });
});
