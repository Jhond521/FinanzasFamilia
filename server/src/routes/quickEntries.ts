import { Router } from 'express';
import { Prisma, type QuickEntry } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { toDateOnly } from '../lib/dates';

export const quickEntriesRouter = Router();

const { Decimal } = Prisma;

const QUICK_ENTRY_TYPES = ['personal', 'joint'] as const;
const QUICK_ENTRY_STATUSES = ['pending', 'matched', 'no_match_expected'] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(DATE_RE, 'Fecha debe ser YYYY-MM-DD');

const createQuickEntrySchema = z.object({
  amount: z.union([z.string(), z.number()]),
  description: z.string().trim().min(1),
  type: z.enum(QUICK_ENTRY_TYPES),
  date: dateSchema.optional(),
  userId: z.string().uuid().optional(),
});

// 'matched' no es asignable a mano: solo lo pone el pipeline de import/match (Fase 3) al
// conciliar con una transaccion. Lo unico editable manualmente es marcar/desmarcar
// "no se espera match" (ej. gasto en efectivo que nunca va a aparecer en el extracto).
const MANUALLY_SETTABLE_STATUSES = ['pending', 'no_match_expected'] as const;

const updateQuickEntrySchema = z.object({
  amount: z.union([z.string(), z.number()]).optional(),
  description: z.string().trim().min(1).optional(),
  type: z.enum(QUICK_ENTRY_TYPES).optional(),
  date: dateSchema.optional(),
  userId: z.string().uuid().optional(),
  status: z.enum(MANUALLY_SETTABLE_STATUSES).optional(),
});

function badRequest(res: import('express').Response, code: string, message: string): void {
  res.status(400).json({ error: { code, message } });
}

/** "2026-07-05" -> Date a medianoche UTC, para no correrse de dia por zona horaria. */
function parseDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/** El campo `date` es DateTime en Prisma (medianoche UTC); la API expone solo YYYY-MM-DD (docs/03-api.md). */
function serializeQuickEntry(entry: QuickEntry) {
  return { ...entry, date: toDateOnly(entry.date) };
}

/** Busca el Month (year/month) al que pertenece una fecha YYYY-MM-DD. */
async function findMonthForDate(date: string) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return prisma.month.findUnique({ where: { year_month: { year, month } } });
}

quickEntriesRouter.post('/', async (req, res) => {
  const parsed = createQuickEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const data = parsed.data;
  const date = data.date ?? todayDateOnly();

  const month = await findMonthForDate(date);
  if (!month) {
    badRequest(res, 'month_not_found', `No existe un mes creado para ${date.slice(0, 7)}`);
    return;
  }
  if (month.status === 'closed') {
    badRequest(res, 'month_closed', 'El mes esta cerrado');
    return;
  }

  // Los gastos se guardan negativos (igual que el extracto bancario), sin importar el signo recibido.
  const amount = new Decimal(data.amount).abs().negated();

  const quickEntry = await prisma.quickEntry.create({
    data: {
      monthId: month.id,
      userId: data.userId ?? req.user!.id,
      createdBy: req.user!.id,
      amount,
      description: data.description,
      type: data.type,
      date: parseDateOnly(date),
    },
  });
  res.status(201).json({ quickEntry: serializeQuickEntry(quickEntry) });
});

quickEntriesRouter.get('/', async (req, res) => {
  const monthId = typeof req.query.monthId === 'string' ? req.query.monthId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  if (!monthId) {
    badRequest(res, 'invalid_query', 'monthId es requerido');
    return;
  }
  if (status && !QUICK_ENTRY_STATUSES.includes(status as (typeof QUICK_ENTRY_STATUSES)[number])) {
    badRequest(res, 'invalid_query', 'status invalido');
    return;
  }

  const quickEntries = await prisma.quickEntry.findMany({
    where: { monthId, status: status as (typeof QUICK_ENTRY_STATUSES)[number] | undefined },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({ quickEntries: quickEntries.map(serializeQuickEntry) });
});

quickEntriesRouter.put('/:id', async (req, res) => {
  const existing = await prisma.quickEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Registro no encontrado' } });
    return;
  }

  const parsed = updateQuickEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const data = parsed.data;
  const nextDate = data.date ?? existing.date.toISOString().slice(0, 10);

  let monthId = existing.monthId;
  if (data.date) {
    const month = await findMonthForDate(nextDate);
    if (!month) {
      badRequest(res, 'month_not_found', `No existe un mes creado para ${nextDate.slice(0, 7)}`);
      return;
    }
    monthId = month.id;
  }

  const quickEntry = await prisma.quickEntry.update({
    where: { id: existing.id },
    data: {
      monthId,
      userId: data.userId ?? existing.userId,
      amount: data.amount !== undefined ? new Decimal(data.amount).abs().negated() : existing.amount,
      description: data.description ?? existing.description,
      type: data.type ?? existing.type,
      date: data.date ? parseDateOnly(data.date) : existing.date,
      status: data.status ?? existing.status,
    },
  });
  res.json({ quickEntry: serializeQuickEntry(quickEntry) });
});

quickEntriesRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.quickEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Registro no encontrado' } });
    return;
  }
  await prisma.quickEntry.delete({ where: { id: existing.id } });
  res.status(204).end();
});
