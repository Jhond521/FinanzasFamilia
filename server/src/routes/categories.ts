import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const categoriesRouter = Router();

// Solo lectura: las categorias quedan fijas por seed en esta fase (decision confirmada del
// ticket #2) — no hay pantalla de administracion de categorias todavia.
categoriesRouter.get('/', async (_req, res) => {
  const categories = await prisma.category.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
  res.json({ categories });
});
