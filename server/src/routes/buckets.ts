import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const bucketsRouter = Router();

const { Decimal } = Prisma;

const SPLIT_MODES = ['proportional', 'half'] as const;
const BUCKET_KINDS = ['savings', 'personal', 'shared_expenses', 'other'] as const;

const createBucketSchema = z.object({
  name: z.string().trim().min(1),
  percentage: z.union([z.string(), z.number()]),
  splitMode: z.enum(SPLIT_MODES),
  kind: z.enum(BUCKET_KINDS),
  active: z.boolean().optional().default(true),
});

const updateBucketSchema = z.object({
  name: z.string().trim().min(1).optional(),
  percentage: z.union([z.string(), z.number()]).optional(),
  splitMode: z.enum(SPLIT_MODES).optional(),
  kind: z.enum(BUCKET_KINDS).optional(),
  active: z.boolean().optional(),
});

function badRequest(res: import('express').Response, code: string, message: string): void {
  res.status(400).json({ error: { code, message } });
}

/** Valida que los rubros activos (excluyendo `excludeId`, sumando `candidate` si viene) sumen 100%. */
async function assertActiveBucketsSumTo100(
  candidate: { id?: string; percentage: InstanceType<typeof Prisma.Decimal>; active: boolean },
): Promise<boolean> {
  const others = await prisma.bucket.findMany({
    where: { active: true, id: candidate.id ? { not: candidate.id } : undefined },
    select: { percentage: true },
  });
  const sum = others.reduce((acc, b) => acc.plus(b.percentage), new Decimal(0));
  const total = candidate.active ? sum.plus(candidate.percentage) : sum;
  return total.equals(100);
}

bucketsRouter.get('/', async (_req, res) => {
  const buckets = await prisma.bucket.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json({ buckets });
});

bucketsRouter.post('/', async (req, res) => {
  const parsed = createBucketSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const data = parsed.data;
  const percentage = new Decimal(data.percentage);

  const sumsTo100 = await assertActiveBucketsSumTo100({ percentage, active: data.active });
  if (!sumsTo100) {
    badRequest(res, 'buckets_must_sum_100', 'Los rubros activos deben sumar 100%');
    return;
  }

  const maxSortOrder = await prisma.bucket.aggregate({ _max: { sortOrder: true } });
  const bucket = await prisma.bucket.create({
    data: {
      name: data.name,
      percentage,
      splitMode: data.splitMode,
      kind: data.kind,
      active: data.active,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });
  res.status(201).json({ bucket });
});

bucketsRouter.put('/:id', async (req, res) => {
  const parsed = updateBucketSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const existing = await prisma.bucket.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Rubro no encontrado' } });
    return;
  }

  const data = parsed.data;
  const percentage = data.percentage !== undefined ? new Decimal(data.percentage) : existing.percentage;
  const active = data.active ?? existing.active;

  const sumsTo100 = await assertActiveBucketsSumTo100({ id: existing.id, percentage, active });
  if (!sumsTo100) {
    badRequest(res, 'buckets_must_sum_100', 'Los rubros activos deben sumar 100%');
    return;
  }

  const bucket = await prisma.bucket.update({
    where: { id: existing.id },
    data: {
      name: data.name ?? existing.name,
      percentage,
      splitMode: data.splitMode ?? existing.splitMode,
      kind: data.kind ?? existing.kind,
      active,
    },
  });
  res.json({ bucket });
});
