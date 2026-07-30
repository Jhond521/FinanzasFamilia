import { Router } from 'express';
import { prisma } from '../lib/prisma';

export const usersRouter = Router();

usersRouter.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } });
  res.json({ users });
});
