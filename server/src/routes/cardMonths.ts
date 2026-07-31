import { Router } from 'express';
import multer from 'multer';
import { Prisma, type CardItem } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { toDateOnly } from '../lib/dates';
import { cardMonthProgress } from '../services/cardProgress';
import { parseNuFile } from '../services/nuParser';

export const cardMonthsRouter = Router();
export const cardItemsRouter = Router();

const { Decimal } = Prisma;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const CARD_ITEM_TYPES = ['personal', 'joint'] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(DATE_RE, 'Fecha debe ser YYYY-MM-DD');

const updateCardMonthSchema = z.object({ amountPaid: z.union([z.string(), z.number()]) });

const createCardItemSchema = z.object({
  description: z.string().trim().min(1),
  date: dateSchema.optional(),
  amount: z.union([z.string(), z.number()]),
  type: z.enum(CARD_ITEM_TYPES),
  isAdjustment: z.boolean().optional().default(false),
});

const updateCardItemSchema = z.object({
  description: z.string().trim().min(1).optional(),
  date: dateSchema.nullable().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  type: z.enum(CARD_ITEM_TYPES).optional(),
  isAdjustment: z.boolean().optional(),
});

function badRequest(res: import('express').Response, code: string, message: string): void {
  res.status(400).json({ error: { code, message } });
}

function serializeCardItem(item: CardItem) {
  return { ...item, date: item.date ? toDateOnly(item.date) : null, amount: item.amount.toString() };
}

/** Σitems/Diferencia recalculados, para devolver junto con la respuesta de cada mutacion. */
async function progressPayload(cardMonthId: string) {
  const cardMonth = await prisma.cardMonth.findUniqueOrThrow({
    where: { id: cardMonthId },
    include: { items: true },
  });
  const progress = cardMonthProgress(cardMonth.amountPaid, cardMonth.items);
  return { itemsTotal: progress.itemsTotal.toString(), diff: progress.diff.toString(), diffStatus: progress.status };
}

cardMonthsRouter.put('/:id', async (req, res) => {
  const existing = await prisma.cardMonth.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Card month no encontrado' } });
    return;
  }
  const parsed = updateCardMonthSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const cardMonth = await prisma.cardMonth.update({
    where: { id: existing.id },
    data: { amountPaid: new Decimal(parsed.data.amountPaid) },
  });
  const progress = await progressPayload(cardMonth.id);
  res.json({ cardMonth: { ...cardMonth, amountPaid: cardMonth.amountPaid.toString() }, ...progress });
});

cardMonthsRouter.post('/:id/items', async (req, res) => {
  const cardMonth = await prisma.cardMonth.findUnique({ where: { id: req.params.id } });
  if (!cardMonth) {
    res.status(404).json({ error: { code: 'not_found', message: 'Card month no encontrado' } });
    return;
  }
  const parsed = createCardItemSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const data = parsed.data;
  const item = await prisma.cardItem.create({
    data: {
      cardMonthId: cardMonth.id,
      description: data.description,
      date: data.date ? new Date(`${data.date}T00:00:00.000Z`) : null,
      amount: new Decimal(data.amount).abs(),
      type: data.type,
      isAdjustment: data.isAdjustment,
    },
  });
  const progress = await progressPayload(cardMonth.id);
  res.status(201).json({ item: serializeCardItem(item), ...progress });
});

cardItemsRouter.put('/:id', async (req, res) => {
  const existing = await prisma.cardItem.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Item no encontrado' } });
    return;
  }
  const parsed = updateCardItemSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const data = parsed.data;
  const item = await prisma.cardItem.update({
    where: { id: existing.id },
    data: {
      description: data.description ?? existing.description,
      date: data.date !== undefined ? (data.date ? new Date(`${data.date}T00:00:00.000Z`) : null) : existing.date,
      amount: data.amount !== undefined ? new Decimal(data.amount).abs() : existing.amount,
      type: data.type ?? existing.type,
      isAdjustment: data.isAdjustment ?? existing.isAdjustment,
    },
  });
  const progress = await progressPayload(existing.cardMonthId);
  res.json({ item: serializeCardItem(item), ...progress });
});

cardItemsRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.cardItem.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Item no encontrado' } });
    return;
  }
  await prisma.cardItem.delete({ where: { id: existing.id } });
  const progress = await progressPayload(existing.cardMonthId);
  res.json(progress);
});

/**
 * Precarga items desde el extracto Nu (csv/xlsx) SIN guardarlos todavia — el usuario los revisa y
 * confirma uno a uno (POST /:id/items) antes de que queden en BD (a diferencia del import
 * bancario de Fase 3, que si inserta directo). Ver Notas tecnicas del ticket #3 sobre el formato
 * asumido del extracto.
 */
cardMonthsRouter.post('/:id/import', upload.single('file'), async (req, res) => {
  const cardMonth = await prisma.cardMonth.findUnique({ where: { id: `${req.params.id}` } });
  if (!cardMonth) {
    res.status(404).json({ error: { code: 'not_found', message: 'Card month no encontrado' } });
    return;
  }
  if (!req.file) {
    badRequest(res, 'file_required', 'Falta el archivo del extracto Nu');
    return;
  }
  try {
    const rows = parseNuFile(req.file.buffer);
    res.json({ items: rows });
  } catch (error) {
    badRequest(res, 'invalid_file', error instanceof Error ? error.message : 'No se pudo leer el archivo');
  }
});
