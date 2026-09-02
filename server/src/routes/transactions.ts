import { Router } from 'express';
import {
  Prisma,
  type QuickEntry,
  type QuickEntryTypeOption,
  type Rule as PrismaRule,
  type Transaction,
} from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { toDateOnly } from '../lib/dates';
import { dedupeKey as computeDedupeKey } from '../services/dedupe';
import { findMatchCandidates } from '../services/matching';
import { evaluateRules, type RuleCandidate } from '../services/rulesEngine';

export const transactionsRouter = Router();

const { Decimal } = Prisma;

const TRANSACTION_TYPES = ['personal', 'joint', 'movement', 'unclassified'] as const;

const updateTransactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  detail: z.string().trim().nullable().optional(),
});

const bulkUpdateSchema = z.array(
  z.object({
    id: z.string().uuid(),
    type: z.enum(TRANSACTION_TYPES),
    categoryId: z.string().uuid().nullable().optional(),
    detail: z.string().trim().nullable().optional(),
  }),
);

const matchSchema = z.object({ quickEntryId: z.string().uuid() });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Transaccion manual (ticket #92): sin archivo de por medio, el usuario aporta todos los campos
// que normalmente vienen del extracto. `bankDescription` aqui SI es libre/editable -- a diferencia
// de una transaccion importada, no representa el texto textual e inmutable de un banco (RF5).
const createTransactionSchema = z.object({
  date: z.string().regex(DATE_RE, 'Fecha debe ser YYYY-MM-DD'),
  bankDescription: z.string().trim().min(1),
  amount: z.union([z.string(), z.number()]),
  ownerUserId: z.string().uuid(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  detail: z.string().trim().nullable().optional(),
});

function badRequest(res: import('express').Response, code: string, message: string): void {
  res.status(400).json({ error: { code, message } });
}

/** "2026-07-05" -> Date a medianoche UTC, para no correrse de dia por zona horaria (mismo criterio
 * que quickEntries.ts). */
function parseDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Busca el Month (year/month) al que pertenece una fecha YYYY-MM-DD. */
async function findMonthForDate(date: string) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return prisma.month.findUnique({ where: { year_month: { year, month } } });
}

function serializeTransaction(tx: Transaction) {
  return { ...tx, date: toDateOnly(tx.date) };
}

function serializeQuickEntryMatch(qe: QuickEntry & { typeOption: QuickEntryTypeOption }) {
  return { ...qe, date: toDateOnly(qe.date) };
}

function toRuleCandidate(rule: PrismaRule): RuleCandidate {
  return {
    id: rule.id,
    pattern: rule.pattern,
    amountSign: rule.amountSign,
    setType: rule.setType,
    setCategoryId: rule.setCategoryId,
    setDetail: rule.setDetail,
    mode: rule.mode,
  };
}

/**
 * Para transactions que nunca recibieron sugerencia de regla (ni auto ni suggest), recalcula en
 * vivo si hay reglas en conflicto — asi la cola de revision puede mostrar las opciones sin tener
 * que guardar un snapshot en la fila (ver Notas tecnicas del ticket #2).
 */
async function attachLiveRuleConflicts(
  transactions: (Transaction & { matchedQuickEntry: (QuickEntry & { typeOption: QuickEntryTypeOption }) | null })[],
) {
  const needsRecompute = transactions.some((t) => t.needsReview && !t.classifiedBy && !t.ruleId);
  const activeRules = needsRecompute ? (await prisma.rule.findMany({ where: { active: true } })).map(toRuleCandidate) : [];

  return transactions.map((t) => {
    const serialized = {
      ...serializeTransaction(t),
      matchedQuickEntry: t.matchedQuickEntry ? serializeQuickEntryMatch(t.matchedQuickEntry) : null,
    };
    if (!t.needsReview || t.classifiedBy || t.ruleId) {
      return { ...serialized, ruleConflicts: [] as RuleCandidate[] };
    }
    const evaluation = evaluateRules(t.bankDescription, t.amount, activeRules);
    return { ...serialized, ruleConflicts: evaluation.outcome === 'conflict' ? evaluation.candidates : [] };
  });
}

transactionsRouter.get('/', async (req, res) => {
  const { monthId, type, categoryId, needsReview, ownerUserId, q } = req.query;
  if (typeof monthId !== 'string') {
    badRequest(res, 'invalid_query', 'monthId es requerido');
    return;
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      monthId,
      type: typeof type === 'string' ? (type as (typeof TRANSACTION_TYPES)[number]) : undefined,
      categoryId: typeof categoryId === 'string' ? categoryId : undefined,
      needsReview: typeof needsReview === 'string' ? needsReview === 'true' : undefined,
      ownerUserId: typeof ownerUserId === 'string' ? ownerUserId : undefined,
      bankDescription: typeof q === 'string' && q ? { contains: q, mode: 'insensitive' } : undefined,
    },
    // matchedQuickEntry (ticket #93): cual registro rapido hizo match con esta transaccion, si
    // aplica — se muestra en el log de Transacciones. typeOption incluido para reusar el mismo
    // tipo `QuickEntry` del frontend (ya lo trae completo, ver fetchMatchCandidates).
    include: { matchedQuickEntry: { include: { typeOption: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });

  res.json({ transactions: await attachLiveRuleConflicts(transactions) });
});

/** Crea una transaccion manual, sin archivo (ticket #92) -- ej. un gasto en efectivo que nunca va
 * a aparecer en el extracto bancario. `importBatchId` queda null: el undo de un batch de import
 * (imports.ts) nunca la toca, porque no pertenece a ninguno. */
transactionsRouter.post('/', async (req, res) => {
  const parsed = createTransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const data = parsed.data;

  const month = await findMonthForDate(data.date);
  if (!month) {
    badRequest(res, 'month_not_found', `No existe un mes creado para ${data.date.slice(0, 7)}`);
    return;
  }
  if (month.status === 'closed') {
    badRequest(res, 'month_closed', 'El mes esta cerrado');
    return;
  }

  const amount = new Decimal(data.amount);
  const dedupeKeyValue = computeDedupeKey(data.ownerUserId, data.date, data.bankDescription, amount);

  const transaction = await prisma.transaction.create({
    data: {
      monthId: month.id,
      ownerUserId: data.ownerUserId,
      importBatchId: null,
      date: parseDateOnly(data.date),
      bankDescription: data.bankDescription,
      amount,
      dedupeKey: dedupeKeyValue,
      type: data.type ?? 'unclassified',
      categoryId: data.categoryId ?? null,
      detail: data.detail ?? null,
      classifiedBy: 'user',
      needsReview: !data.type,
    },
  });
  res.status(201).json({ transaction: serializeTransaction(transaction) });
});

transactionsRouter.put('/:id', async (req, res) => {
  const existing = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Transaccion no encontrada' } });
    return;
  }
  const parsed = updateTransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const data = parsed.data;
  const transaction = await prisma.transaction.update({
    where: { id: existing.id },
    data: {
      type: data.type ?? existing.type,
      categoryId: data.categoryId !== undefined ? data.categoryId : existing.categoryId,
      detail: data.detail !== undefined ? data.detail : existing.detail,
      classifiedBy: 'user',
      needsReview: false,
    },
  });
  res.json({ transaction: serializeTransaction(transaction) });
});

transactionsRouter.put('/bulk', async (req, res) => {
  const parsed = bulkUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const results = await prisma.$transaction(
    parsed.data.map((item) =>
      prisma.transaction.update({
        where: { id: item.id },
        data: {
          type: item.type,
          categoryId: item.categoryId,
          detail: item.detail,
          classifiedBy: 'user',
          needsReview: false,
        },
      }),
    ),
  );
  res.json({ transactions: results.map(serializeTransaction) });
});

/** Candidatos de match para resolucion manual (varios quick entries calzan la misma transaccion). */
transactionsRouter.get('/:id/match-candidates', async (req, res) => {
  const transaction = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!transaction) {
    res.status(404).json({ error: { code: 'not_found', message: 'Transaccion no encontrada' } });
    return;
  }
  const pendingQuickEntries = await prisma.quickEntry.findMany({
    where: { monthId: transaction.monthId, userId: transaction.ownerUserId, status: 'pending' },
  });
  const candidateIds = new Set(
    findMatchCandidates(
      { ownerUserId: transaction.ownerUserId, amount: transaction.amount, date: toDateOnly(transaction.date) },
      pendingQuickEntries.map((qe) => ({ id: qe.id, userId: qe.userId, amount: qe.amount, date: toDateOnly(qe.date) })),
    ).map((c) => c.id),
  );
  res.json({
    candidates: pendingQuickEntries.filter((qe) => candidateIds.has(qe.id)).map((qe) => ({ ...qe, date: toDateOnly(qe.date) })),
  });
});

/** Confirma manualmente cual quick entry va con cual transaccion (multi-candidato). */
transactionsRouter.post('/:id/match', async (req, res) => {
  const transaction = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!transaction) {
    res.status(404).json({ error: { code: 'not_found', message: 'Transaccion no encontrada' } });
    return;
  }
  const parsed = matchSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const quickEntry = await prisma.quickEntry.findUnique({
    where: { id: parsed.data.quickEntryId },
    include: { typeOption: true },
  });
  if (!quickEntry || quickEntry.status !== 'pending') {
    badRequest(res, 'invalid_quick_entry', 'El registro rapido no existe o ya no esta pendiente');
    return;
  }
  // Monto exacto en valor absoluto (RF5) — mismo criterio que findMatchCandidates: una
  // transaction real puede llegar con signo distinto al del quick_entry (siempre negativo).
  if (
    !new Decimal(quickEntry.amount).abs().equals(new Decimal(transaction.amount).abs()) ||
    quickEntry.userId !== transaction.ownerUserId
  ) {
    badRequest(res, 'not_a_candidate', 'Ese registro rapido no es un candidato valido para esta transaccion');
    return;
  }

  const [updatedTransaction] = await prisma.$transaction([
    prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        type: quickEntry.typeOption.kind,
        detail: quickEntry.description,
        classifiedBy: 'match',
        needsReview: false,
      },
    }),
    prisma.quickEntry.update({
      where: { id: quickEntry.id },
      data: { status: 'matched', matchedTransactionId: transaction.id },
    }),
  ]);

  res.json({ transaction: serializeTransaction(updatedTransaction) });
});
