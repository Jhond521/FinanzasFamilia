import { Router } from 'express';
import { Prisma, type Rule as PrismaRule, type Transaction } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { toDateOnly } from '../lib/dates';
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

function badRequest(res: import('express').Response, code: string, message: string): void {
  res.status(400).json({ error: { code, message } });
}

function serializeTransaction(tx: Transaction) {
  return { ...tx, date: toDateOnly(tx.date) };
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
async function attachLiveRuleConflicts(transactions: Transaction[]) {
  const needsRecompute = transactions.some((t) => t.needsReview && !t.classifiedBy && !t.ruleId);
  const activeRules = needsRecompute ? (await prisma.rule.findMany({ where: { active: true } })).map(toRuleCandidate) : [];

  return transactions.map((t) => {
    const serialized = serializeTransaction(t);
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
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });

  res.json({ transactions: await attachLiveRuleConflicts(transactions) });
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
