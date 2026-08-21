import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const quickEntryTypesRouter = Router();

const QUICK_ENTRY_KINDS = ['personal', 'joint', 'movement'] as const;

const createQuickEntryTypeSchema = z.object({
  name: z.string().trim().min(1),
  kind: z.enum(QUICK_ENTRY_KINDS),
  active: z.boolean().optional().default(true),
});

const updateQuickEntryTypeSchema = z.object({
  name: z.string().trim().min(1).optional(),
  kind: z.enum(QUICK_ENTRY_KINDS).optional(),
  active: z.boolean().optional(),
});

function badRequest(res: import('express').Response, code: string, message: string): void {
  res.status(400).json({ error: { code, message } });
}

/** Identificador estable para los deep links de registro rapido (`/r?tipo=<slug>`), derivado del
 * nombre al crear y despues inmutable -- si el usuario renombra el tipo desde Configuracion, los
 * atajos de PWA ya instalados no se rompen (##73). */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

async function uniqueSlugFor(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;
  while (await prisma.quickEntryTypeOption.findUnique({ where: { slug } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

quickEntryTypesRouter.get('/', async (_req, res) => {
  const quickEntryTypes = await prisma.quickEntryTypeOption.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json({ quickEntryTypes });
});

quickEntryTypesRouter.post('/', async (req, res) => {
  const parsed = createQuickEntryTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const data = parsed.data;

  const slug = await uniqueSlugFor(data.name);
  if (!slug) {
    badRequest(res, 'invalid_name', 'El nombre debe tener al menos una letra o numero');
    return;
  }

  const maxSortOrder = await prisma.quickEntryTypeOption.aggregate({ _max: { sortOrder: true } });
  const quickEntryType = await prisma.quickEntryTypeOption.create({
    data: {
      name: data.name,
      kind: data.kind,
      slug,
      active: data.active,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });
  res.status(201).json({ quickEntryType });
});

quickEntryTypesRouter.put('/:id', async (req, res) => {
  const existing = await prisma.quickEntryTypeOption.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: { code: 'not_found', message: 'Tipo de registro no encontrado' } });
    return;
  }

  const parsed = updateQuickEntryTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, 'invalid_body', parsed.error.message);
    return;
  }
  const data = parsed.data;

  // No dejar el registro rapido sin ningun tipo seleccionable (##73).
  if (data.active === false && existing.active) {
    const otherActiveCount = await prisma.quickEntryTypeOption.count({
      where: { active: true, id: { not: existing.id } },
    });
    if (otherActiveCount === 0) {
      badRequest(res, 'last_active_type', 'Debe quedar al menos un tipo de registro activo');
      return;
    }
  }

  const quickEntryType = await prisma.quickEntryTypeOption.update({
    where: { id: existing.id },
    data: {
      name: data.name ?? existing.name,
      kind: data.kind ?? existing.kind,
      active: data.active ?? existing.active,
    },
  });
  res.json({ quickEntryType });
});
