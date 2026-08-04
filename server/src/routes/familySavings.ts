import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { balanceFromEntries } from '../services/familySavings';

export const familySavingsRouter = Router();

const { Decimal } = Prisma;

const ENTRY_TYPES = ['initial', 'monthly_savings', 'adjustment', 'yield', 'manual'] as const;

const createEntrySchema = z.object({
  userId: z.string().uuid(),
  type: z.enum(ENTRY_TYPES).default('manual'),
  amount: z.union([z.string(), z.number()]),
  description: z.string().trim().min(1),
  monthId: z.string().uuid().optional(),
});

function serializeEntry(entry: {
  id: string;
  userId: string;
  monthId: string | null;
  type: string;
  amount: InstanceType<typeof Prisma.Decimal>;
  description: string;
  createdAt: Date;
}) {
  return {
    id: entry.id,
    userId: entry.userId,
    monthId: entry.monthId,
    type: entry.type,
    amount: entry.amount.toString(),
    description: entry.description,
    createdAt: entry.createdAt,
  };
}

/** Resumen de Ahorros Familiares: saldo de cada persona (suma de sus entradas del ledger) + total. */
familySavingsRouter.get('/summary', async (_req, res) => {
  const [users, entries] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
    prisma.familySavingsEntry.findMany({ select: { userId: true, amount: true } }),
  ]);

  const balances = users.map((user) => ({
    userId: user.id,
    name: user.name,
    balance: balanceFromEntries(entries.filter((e) => e.userId === user.id)).toString(),
  }));
  const total = balanceFromEntries(entries).toString();

  res.json({ balances, total });
});

familySavingsRouter.get('/entries', async (req, res) => {
  const { userId, monthId } = req.query;
  const entries = await prisma.familySavingsEntry.findMany({
    where: {
      userId: typeof userId === 'string' ? userId : undefined,
      monthId: typeof monthId === 'string' ? monthId : undefined,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ entries: entries.map(serializeEntry) });
});

/** Movimiento manual, agregable en cualquier momento desde la pantalla de Ahorros Familiares. */
familySavingsRouter.post('/entries', async (req, res) => {
  const parsed = createEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'invalid_body', message: parsed.error.message } });
    return;
  }

  const created = await prisma.familySavingsEntry.create({
    data: {
      userId: parsed.data.userId,
      type: parsed.data.type,
      amount: new Decimal(parsed.data.amount),
      description: parsed.data.description,
      monthId: parsed.data.monthId ?? null,
    },
  });

  res.status(201).json({ entry: serializeEntry(created) });
});

/**
 * Editar una entrada existente (ticket #49): correcciones de monto/descripcion/tipo/persona.
 * Sin restriccion por `type` -- una entrada `monthly_savings`/`adjustment`/`yield` tambien se puede
 * editar; si el mes se vuelve a cerrar, `writeClosingLedgerEntries` (months.ts) la recalcula igual.
 */
familySavingsRouter.put('/entries/:id', async (req, res) => {
  const parsed = createEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'invalid_body', message: parsed.error.message } });
    return;
  }

  const existing = await prisma.familySavingsEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Entrada no encontrada' } });
    return;
  }

  const updated = await prisma.familySavingsEntry.update({
    where: { id: req.params.id },
    data: {
      userId: parsed.data.userId,
      type: parsed.data.type,
      amount: new Decimal(parsed.data.amount),
      description: parsed.data.description,
      monthId: parsed.data.monthId ?? null,
    },
  });

  res.json({ entry: serializeEntry(updated) });
});

/** Borrar una entrada existente (ticket #49). */
familySavingsRouter.delete('/entries/:id', async (req, res) => {
  const existing = await prisma.familySavingsEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Entrada no encontrada' } });
    return;
  }

  await prisma.familySavingsEntry.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
