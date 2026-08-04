import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { YIELD_AUTO_THRESHOLD } from '../services/familySavings';

export const settingsRouter = Router();

const { Decimal } = Prisma;

const updateSettingsSchema = z.object({
  yieldAutoThreshold: z.union([z.string(), z.number()]),
});

/** Fila unica de configuracion general -- get-or-create, mismo patron que card_months (RF6). */
async function getOrCreateSettings() {
  const existing = await prisma.appSettings.findFirst();
  if (existing) return existing;
  return prisma.appSettings.create({ data: { yieldAutoThreshold: YIELD_AUTO_THRESHOLD } });
}

settingsRouter.get('/', async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.json({ yieldAutoThreshold: settings.yieldAutoThreshold.toString() });
});

settingsRouter.put('/', async (req, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'invalid_body', message: parsed.error.message } });
    return;
  }

  const current = await getOrCreateSettings();
  const updated = await prisma.appSettings.update({
    where: { id: current.id },
    data: { yieldAutoThreshold: new Decimal(parsed.data.yieldAutoThreshold) },
  });

  res.json({ yieldAutoThreshold: updated.yieldAutoThreshold.toString() });
});
