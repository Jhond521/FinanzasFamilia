import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { toDateOnly } from '../lib/dates';
import { cardMonthProgress, splitByType } from '../services/cardProgress';

export const cardsRouter = Router();

const createCardSchema = z.object({
  name: z.string().trim().min(1),
  ownerUserId: z.string().uuid(),
});

function badRequest(res: import('express').Response, code: string, message: string): void {
  res.status(400).json({ error: { code, message } });
}

cardsRouter.get('/', async (_req, res) => {
  const cards = await prisma.creditCard.findMany({ where: { active: true }, include: { owner: true } });
  res.json({ cards });
});

cardsRouter.post('/', async (req, res) => {
  const parsed = createCardSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const card = await prisma.creditCard.create({ data: parsed.data });
  res.status(201).json({ card });
});

/**
 * Devuelve el card_month de esta tarjeta para este mes, creandolo con amount_paid=0 si no existe
 * todavia (get-or-create — no hay POST /api/card-months explicito en docs/03-api.md, decision
 * confirmada del ticket #3). Incluye items, Σitems, Diferencia (con su status para el color de la
 * UI) y el split Personal/Conjunto.
 */
cardsRouter.get('/:id/months/:monthId', async (req, res) => {
  const card = await prisma.creditCard.findUnique({ where: { id: req.params.id } });
  if (!card) {
    res.status(404).json({ error: { code: 'not_found', message: 'Tarjeta no encontrada' } });
    return;
  }
  const month = await prisma.month.findUnique({ where: { id: req.params.monthId } });
  if (!month) {
    res.status(404).json({ error: { code: 'not_found', message: 'Mes no encontrado' } });
    return;
  }

  let cardMonth = await prisma.cardMonth.findUnique({
    where: { creditCardId_monthId: { creditCardId: card.id, monthId: month.id } },
    // Descendente (mas reciente primero, ##63) — nulls explicito porque el default de Postgres
    // para DESC es NULLS FIRST y los items sin fecha deben seguir agrupados al final.
    include: { items: { orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }] } },
  });
  if (!cardMonth) {
    cardMonth = await prisma.cardMonth.create({
      data: { creditCardId: card.id, monthId: month.id },
      include: { items: true },
    });
  }

  const progress = cardMonthProgress(cardMonth.amountPaid, cardMonth.items);
  const split = splitByType(cardMonth.items);

  res.json({
    cardMonth: { id: cardMonth.id, creditCardId: cardMonth.creditCardId, monthId: cardMonth.monthId, amountPaid: cardMonth.amountPaid.toString() },
    items: cardMonth.items.map((item) => ({
      ...item,
      date: item.date ? toDateOnly(item.date) : null,
      amount: item.amount.toString(),
    })),
    itemsTotal: progress.itemsTotal.toString(),
    diff: progress.diff.toString(),
    diffStatus: progress.status,
    split: {
      personal: split.personal.toString(),
      joint: split.joint.toString(),
      personalPercentage: split.personalPercentage.toString(),
      jointPercentage: split.jointPercentage.toString(),
    },
  });
});
