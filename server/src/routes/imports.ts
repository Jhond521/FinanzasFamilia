import { Router } from 'express';
import multer from 'multer';
import { Prisma, type Rule as PrismaRule } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { toDateOnly } from '../lib/dates';
import { parseBancolombiaFile } from '../services/xlsxParser';
import { dedupeKey as computeDedupeKey, planImport } from '../services/dedupe';
import { findMatchCandidates } from '../services/matching';
import { evaluateRules, type RuleCandidate } from '../services/rulesEngine';

export const importsRouter = Router();
export const skippedDuplicatesRouter = Router();

const { Decimal } = Prisma;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const createImportSchema = z.object({
  monthId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
});

function badRequest(res: import('express').Response, code: string, message: string): void {
  res.status(400).json({ error: { code, message } });
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

importsRouter.get('/', async (_req, res) => {
  const batches = await prisma.importBatch.findMany({
    orderBy: { createdAt: 'desc' },
    include: { owner: true, uploader: true },
  });
  res.json({ batches });
});

/** Preview de filas antes de confirmar el import (RF4) — no escribe nada en BD, solo parsea. */
importsRouter.post('/preview', upload.single('file'), (req, res) => {
  if (!req.file) {
    badRequest(res, 'file_required', 'Falta el archivo .xlsx');
    return;
  }

  let parsedRows;
  try {
    parsedRows = parseBancolombiaFile(req.file.buffer);
  } catch (error) {
    badRequest(res, 'invalid_file', error instanceof Error ? error.message : 'No se pudo leer el archivo');
    return;
  }

  res.json({ totalRows: parsedRows.length, rows: parsedRows.slice(0, 10) });
});

importsRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    badRequest(res, 'file_required', 'Falta el archivo .xlsx');
    return;
  }
  const parsed = createImportSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const { monthId, ownerUserId } = parsed.data;

  const month = await prisma.month.findUnique({ where: { id: monthId } });
  if (!month) {
    res.status(404).json({ error: { code: 'not_found', message: 'Mes no encontrado' } });
    return;
  }
  if (month.status === 'closed') {
    badRequest(res, 'month_closed', 'El mes esta cerrado');
    return;
  }

  let parsedRows;
  try {
    parsedRows = parseBancolombiaFile(req.file.buffer);
  } catch (error) {
    badRequest(res, 'invalid_file', error instanceof Error ? error.message : 'No se pudo leer el archivo');
    return;
  }

  const monthPrefix = `${month.year}-${String(month.month).padStart(2, '0')}`;
  const inMonthRows = parsedRows.filter((row) => row.date.startsWith(monthPrefix));
  const rejectedOutOfMonth = parsedRows.length - inMonthRows.length;

  const rowsWithKey = inMonthRows.map((row) => ({
    ...row,
    dedupeKey: computeDedupeKey(ownerUserId, row.date, row.bankDescription, row.amount),
  }));

  const existingTransactions = await prisma.transaction.findMany({
    where: { monthId, ownerUserId },
    select: { dedupeKey: true },
  });
  const existingCounts = new Map<string, number>();
  for (const tx of existingTransactions) {
    existingCounts.set(tx.dedupeKey, (existingCounts.get(tx.dedupeKey) ?? 0) + 1);
  }

  const { toImport, toSkip } = planImport(rowsWithKey, existingCounts);

  const [pendingQuickEntries, activeRules] = await Promise.all([
    prisma.quickEntry.findMany({
      where: { monthId, userId: ownerUserId, status: 'pending' },
      include: { typeOption: true },
    }),
    prisma.rule.findMany({ where: { active: true } }),
  ]);
  const ruleCandidates = activeRules.map(toRuleCandidate);
  const availableQuickEntries = [...pendingQuickEntries];
  const hitRuleIds = new Map<string, number>();

  const batch = await prisma.$transaction(async (tx) => {
    const createdBatch = await tx.importBatch.create({
      data: {
        monthId,
        ownerUserId,
        filename: req.file!.originalname,
        uploadedBy: req.user!.id,
        rowCount: parsedRows.length,
        importedCount: toImport.length,
        duplicateCount: toSkip.length,
      },
    });

    let autoClassified = 0;
    let needsReview = 0;
    let matchedQuickEntries = 0;

    for (const row of toImport) {
      const candidates = findMatchCandidates(
        { ownerUserId, amount: row.amount, date: row.date },
        availableQuickEntries.map((qe) => ({ id: qe.id, userId: qe.userId, amount: qe.amount, date: qe.date.toISOString().slice(0, 10) })),
      );

      if (candidates.length === 1) {
        const matchedEntry = availableQuickEntries.find((qe) => qe.id === candidates[0].id)!;
        const created = await tx.transaction.create({
          data: {
            monthId,
            ownerUserId,
            importBatchId: createdBatch.id,
            date: new Date(`${row.date}T00:00:00.000Z`),
            bankTime: row.bankTime,
            bankDescription: row.bankDescription,
            bankReference: row.bankReference,
            amount: new Decimal(row.amount),
            type: matchedEntry.typeOption.kind,
            detail: matchedEntry.description,
            classifiedBy: 'match',
            dedupeKey: row.dedupeKey,
            needsReview: false,
          },
        });
        await tx.quickEntry.update({
          where: { id: matchedEntry.id },
          data: { status: 'matched', matchedTransactionId: created.id },
        });
        availableQuickEntries.splice(availableQuickEntries.indexOf(matchedEntry), 1);
        matchedQuickEntries += 1;
        autoClassified += 1;
        continue;
      }

      if (candidates.length > 1) {
        // Varios candidatos: no se auto-matchea (decision confirmada) — la transaccion queda a
        // revision, y "Candidatos de match" recalcula esto mismo en vivo para resolucion manual.
        await tx.transaction.create({
          data: {
            monthId,
            ownerUserId,
            importBatchId: createdBatch.id,
            date: new Date(`${row.date}T00:00:00.000Z`),
            bankTime: row.bankTime,
            bankDescription: row.bankDescription,
            bankReference: row.bankReference,
            amount: new Decimal(row.amount),
            dedupeKey: row.dedupeKey,
            needsReview: true,
          },
        });
        needsReview += 1;
        continue;
      }

      const evaluation = evaluateRules(row.bankDescription, row.amount, ruleCandidates);
      if (evaluation.outcome === 'matched') {
        const rule = evaluation.rule;
        hitRuleIds.set(rule.id, (hitRuleIds.get(rule.id) ?? 0) + 1);
        const isAuto = rule.mode === 'auto';
        await tx.transaction.create({
          data: {
            monthId,
            ownerUserId,
            importBatchId: createdBatch.id,
            date: new Date(`${row.date}T00:00:00.000Z`),
            bankTime: row.bankTime,
            bankDescription: row.bankDescription,
            bankReference: row.bankReference,
            amount: new Decimal(row.amount),
            dedupeKey: row.dedupeKey,
            ruleId: rule.id,
            suggestedType: rule.setType,
            suggestedCategoryId: rule.setCategoryId,
            suggestedDetail: rule.setDetail,
            ...(isAuto
              ? {
                  type: rule.setType,
                  categoryId: rule.setCategoryId,
                  detail: rule.setDetail,
                  classifiedBy: 'rule' as const,
                  needsReview: false,
                }
              : { needsReview: true }),
          },
        });
        if (isAuto) autoClassified += 1;
        else needsReview += 1;
        continue;
      }

      // 'none' o 'conflict': queda sin_clasificar, a revision (los candidatos en conflicto de
      // reglas se recalculan en vivo desde GET /api/transactions, ver Notas tecnicas del ticket).
      await tx.transaction.create({
        data: {
          monthId,
          ownerUserId,
          importBatchId: createdBatch.id,
          date: new Date(`${row.date}T00:00:00.000Z`),
          bankTime: row.bankTime,
          bankDescription: row.bankDescription,
          bankReference: row.bankReference,
          amount: new Decimal(row.amount),
          dedupeKey: row.dedupeKey,
          needsReview: true,
        },
      });
      needsReview += 1;
    }

    for (const row of toSkip) {
      await tx.skippedDuplicate.create({
        data: {
          importBatchId: createdBatch.id,
          dedupeKey: row.dedupeKey,
          date: new Date(`${row.date}T00:00:00.000Z`),
          bankDescription: row.bankDescription,
          bankReference: row.bankReference,
          amount: new Decimal(row.amount),
        },
      });
    }

    for (const [ruleId, count] of hitRuleIds) {
      await tx.rule.update({ where: { id: ruleId }, data: { hitCount: { increment: count } } });
    }

    return {
      batchId: createdBatch.id,
      imported: toImport.length,
      duplicatesSkipped: toSkip.length,
      autoClassified,
      needsReview,
      matchedQuickEntries,
      rejectedOutOfMonth,
    };
  });

  res.status(201).json(batch);
});

importsRouter.post('/:batchId/undo', async (req, res) => {
  const batch = await prisma.importBatch.findUnique({ where: { id: req.params.batchId } });
  if (!batch) {
    res.status(404).json({ error: { code: 'not_found', message: 'Batch no encontrado' } });
    return;
  }
  if (batch.status === 'undone') {
    badRequest(res, 'already_undone', 'Este batch ya fue deshecho');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const transactions = await tx.transaction.findMany({ where: { importBatchId: batch.id }, select: { id: true } });
    const transactionIds = transactions.map((t) => t.id);

    if (transactionIds.length > 0) {
      // Repone a pending los quick entries que este batch dejo en matched — si no, quedarian
      // apuntando a transactions que se van a borrar (criterio de aceptacion del ticket #2).
      await tx.quickEntry.updateMany({
        where: { matchedTransactionId: { in: transactionIds } },
        data: { status: 'pending', matchedTransactionId: null },
      });
    }

    await tx.skippedDuplicate.deleteMany({ where: { importBatchId: batch.id } });
    await tx.transaction.deleteMany({ where: { importBatchId: batch.id } });
    await tx.importBatch.update({ where: { id: batch.id }, data: { status: 'undone' } });
  });

  res.json({ ok: true });
});

importsRouter.get('/:batchId/duplicates', async (req, res) => {
  const batch = await prisma.importBatch.findUnique({ where: { id: req.params.batchId } });
  if (!batch) {
    res.status(404).json({ error: { code: 'not_found', message: 'Batch no encontrado' } });
    return;
  }

  const skipped = await prisma.skippedDuplicate.findMany({ where: { importBatchId: batch.id } });
  const dedupeKeys = [...new Set(skipped.map((s) => s.dedupeKey))];
  const existing = await prisma.transaction.findMany({
    where: { monthId: batch.monthId, ownerUserId: batch.ownerUserId, dedupeKey: { in: dedupeKeys } },
  });

  const groups = dedupeKeys.map((key) => ({
    dedupeKey: key,
    existing: existing.filter((t) => t.dedupeKey === key).map((t) => ({ ...t, date: toDateOnly(t.date) })),
    skipped: skipped.filter((s) => s.dedupeKey === key).map((s) => ({ ...s, date: toDateOnly(s.date) })),
  }));

  res.json({ groups });
});

skippedDuplicatesRouter.post('/:id/confirm', async (req, res) => {
  const existing = await prisma.skippedDuplicate.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Fila no encontrada' } });
    return;
  }
  const updated = await prisma.skippedDuplicate.update({
    where: { id: existing.id },
    data: { resolution: 'confirmed_duplicate' },
  });
  res.json({ skippedDuplicate: { ...updated, date: toDateOnly(updated.date) } });
});

skippedDuplicatesRouter.post('/:id/force', async (req, res) => {
  const existing = await prisma.skippedDuplicate.findUnique({ where: { id: req.params.id }, include: { importBatch: true } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Fila no encontrada' } });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        monthId: existing.importBatch.monthId,
        ownerUserId: existing.importBatch.ownerUserId,
        importBatchId: existing.importBatchId,
        date: existing.date,
        bankDescription: existing.bankDescription,
        bankReference: existing.bankReference,
        amount: existing.amount,
        dedupeKey: existing.dedupeKey,
        needsReview: true,
      },
    });
    return tx.skippedDuplicate.update({
      where: { id: existing.id },
      data: { resolution: 'forced_twin', forcedTransactionId: transaction.id },
    });
  });

  res.json({ skippedDuplicate: { ...result, date: toDateOnly(result.date) } });
});

skippedDuplicatesRouter.post('/bulk-confirm', async (req, res) => {
  const schema = z.object({ batchId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const result = await prisma.skippedDuplicate.updateMany({
    where: { importBatchId: parsed.data.batchId, resolution: 'pending' },
    data: { resolution: 'confirmed_duplicate' },
  });
  res.json({ confirmed: result.count });
});
