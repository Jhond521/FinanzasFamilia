import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const rulesRouter = Router();

const RULE_SET_TYPES = ['personal', 'joint', 'movement'] as const;
const RULE_MODES = ['auto', 'suggest'] as const;
const AMOUNT_SIGNS = ['any', 'positive', 'negative'] as const;

const LEARN_THRESHOLD = 3;

const createRuleSchema = z.object({
  pattern: z.string().trim().min(1),
  setType: z.enum(RULE_SET_TYPES),
  setCategoryId: z.string().uuid().optional(),
  setDetail: z.string().trim().min(1).optional(),
  mode: z.enum(RULE_MODES),
  amountSign: z.enum(AMOUNT_SIGNS).optional(),
});

const updateRuleSchema = z.object({
  pattern: z.string().trim().min(1).optional(),
  setType: z.enum(RULE_SET_TYPES).optional(),
  setCategoryId: z.string().uuid().nullable().optional(),
  setDetail: z.string().trim().min(1).nullable().optional(),
  mode: z.enum(RULE_MODES).optional(),
  amountSign: z.enum(AMOUNT_SIGNS).optional(),
  active: z.boolean().optional(),
});

const acceptSuggestionSchema = z.object({
  pattern: z.string().trim().min(1),
  setType: z.enum(RULE_SET_TYPES),
  setCategoryId: z.string().uuid().optional(),
  setDetail: z.string().trim().min(1).optional(),
  mode: z.enum(RULE_MODES).optional().default('auto'),
  monthId: z.string().uuid().optional(),
});

function badRequest(res: import('express').Response, code: string, message: string): void {
  res.status(400).json({ error: { code, message } });
}

rulesRouter.get('/', async (_req, res) => {
  const rules = await prisma.rule.findMany({ orderBy: { createdAt: 'asc' } });
  res.json({ rules });
});

rulesRouter.post('/', async (req, res) => {
  const parsed = createRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const data = parsed.data;
  const rule = await prisma.rule.create({
    data: {
      pattern: data.pattern,
      setType: data.setType,
      setCategoryId: data.setCategoryId ?? null,
      setDetail: data.setDetail ?? null,
      mode: data.mode,
      amountSign: data.amountSign ?? 'any',
      createdFrom: 'user',
    },
  });
  res.status(201).json({ rule });
});

rulesRouter.put('/:id', async (req, res) => {
  const existing = await prisma.rule.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Regla no encontrada' } });
    return;
  }
  const parsed = updateRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const data = parsed.data;
  const rule = await prisma.rule.update({
    where: { id: existing.id },
    data: {
      pattern: data.pattern ?? existing.pattern,
      setType: data.setType ?? existing.setType,
      setCategoryId: data.setCategoryId !== undefined ? data.setCategoryId : existing.setCategoryId,
      setDetail: data.setDetail !== undefined ? data.setDetail : existing.setDetail,
      mode: data.mode ?? existing.mode,
      amountSign: data.amountSign ?? existing.amountSign,
      active: data.active ?? existing.active,
    },
  });
  res.json({ rule });
});

rulesRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.rule.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Regla no encontrada' } });
    return;
  }
  await prisma.rule.delete({ where: { id: existing.id } });
  res.status(204).end();
});

/**
 * Aprendizaje (RF5): descripciones que el usuario clasifico >=3 veces con el mismo tipo+categoria
 * y que ninguna regla activa ya cubre. Interpretacion literal del PRD ("la misma descripcion") —
 * agrupa por bank_description exacto, no por un patron/substring inferido.
 */
rulesRouter.get('/suggestions', async (req, res) => {
  const monthId = typeof req.query.monthId === 'string' ? req.query.monthId : undefined;
  if (!monthId) {
    badRequest(res, 'invalid_query', 'monthId es requerido');
    return;
  }

  const [userClassified, activeRules] = await Promise.all([
    prisma.transaction.findMany({
      where: { monthId, classifiedBy: 'user' },
      select: { bankDescription: true, type: true, categoryId: true, detail: true },
    }),
    prisma.rule.findMany({ where: { active: true }, select: { pattern: true } }),
  ]);

  const groups = new Map<
    string,
    { bankDescription: string; type: string; categoryId: string | null; detail: string | null; count: number }
  >();
  for (const tx of userClassified) {
    if (tx.type === 'unclassified') continue;
    const key = `${tx.bankDescription.trim().toUpperCase()}|${tx.type}|${tx.categoryId ?? ''}`;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
    } else {
      groups.set(key, {
        bankDescription: tx.bankDescription.trim(),
        type: tx.type,
        categoryId: tx.categoryId,
        detail: tx.detail,
        count: 1,
      });
    }
  }

  const alreadyCovered = new Set(activeRules.map((r) => r.pattern.trim().toUpperCase()));
  const suggestions = [...groups.values()]
    .filter((g) => g.count >= LEARN_THRESHOLD && !alreadyCovered.has(g.bankDescription.toUpperCase()))
    .map((g) => ({
      pattern: g.bankDescription,
      setType: g.type,
      setCategoryId: g.categoryId,
      setDetail: g.detail,
      count: g.count,
    }));

  res.json({ suggestions });
});

rulesRouter.post('/suggestions/accept', async (req, res) => {
  const parsed = acceptSuggestionSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const data = parsed.data;

  const rule = await prisma.rule.create({
    data: {
      pattern: data.pattern,
      setType: data.setType,
      setCategoryId: data.setCategoryId ?? null,
      setDetail: data.setDetail ?? null,
      mode: data.mode,
      createdFrom: 'learned',
    },
  });

  let reclassified = 0;
  if (data.monthId) {
    const result = await applyRuleToMonth(rule, data.monthId);
    reclassified = result;
  }

  res.status(201).json({ rule, reclassified });
});

rulesRouter.post('/:id/apply', async (req, res) => {
  const rule = await prisma.rule.findUnique({ where: { id: req.params.id } });
  if (!rule) {
    res.status(404).json({ error: { code: 'not_found', message: 'Regla no encontrada' } });
    return;
  }
  const monthId = typeof req.query.monthId === 'string' ? req.query.monthId : undefined;
  if (!monthId) {
    badRequest(res, 'invalid_query', 'monthId es requerido');
    return;
  }
  const reclassified = await applyRuleToMonth(rule, monthId);
  res.json({ reclassified });
});

/** Aplica una regla a las transactions sin_clasificar (o needs_review) del mes que calcen su patron. */
async function applyRuleToMonth(
  rule: { id: string; pattern: string; setType: string; setCategoryId: string | null; setDetail: string | null; mode: string },
  monthId: string,
): Promise<number> {
  const candidates = await prisma.transaction.findMany({
    where: { monthId, needsReview: true },
  });
  const normalizedPattern = rule.pattern.trim().toUpperCase();
  const matching = candidates.filter((tx) => tx.bankDescription.toUpperCase().includes(normalizedPattern));

  if (matching.length === 0) return 0;

  if (rule.mode === 'auto') {
    await prisma.transaction.updateMany({
      where: { id: { in: matching.map((tx) => tx.id) } },
      data: {
        type: rule.setType as never,
        categoryId: rule.setCategoryId,
        detail: rule.setDetail,
        classifiedBy: 'rule',
        ruleId: rule.id,
        needsReview: false,
      },
    });
  } else {
    await prisma.transaction.updateMany({
      where: { id: { in: matching.map((tx) => tx.id) } },
      data: {
        suggestedType: rule.setType as never,
        suggestedCategoryId: rule.setCategoryId,
        suggestedDetail: rule.setDetail,
        ruleId: rule.id,
      },
    });
  }
  await prisma.rule.update({ where: { id: rule.id }, data: { hitCount: { increment: matching.length } } });
  return matching.length;
}
