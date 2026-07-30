import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import ConnectPgSimple from 'connect-pg-simple';
import passport from 'passport';
import { configurePassport } from './passport';
import { authRouter } from './routes/auth';
import { bucketsRouter } from './routes/buckets';
import { monthsRouter } from './routes/months';
import { usersRouter } from './routes/users';

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error('SESSION_SECRET no esta definido');
}

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === 'production';

// Railway termina TLS en su edge y reenvia por HTTP interno: sin esto, express-session
// no reconoce la conexion como segura y la cookie con secure:true nunca queda activa.
if (isProduction) {
  app.set('trust proxy', 1);
}

const PgSession = ConnectPgSimple(session);

app.use(express.json());
app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 90, // ~90 dias, para no re-loguearse en el celular
    },
  }),
);

configurePassport();
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: 'unauthenticated', message: 'No hay sesion activa' } });
    return;
  }
  next();
}

app.use('/api/buckets', requireAuth, bucketsRouter);
app.use('/api/months', requireAuth, monthsRouter);
app.use('/api/users', requireAuth, usersRouter);

if (isProduction) {
  const webDist = path.join(__dirname, '../../web/dist');
  app.use(express.static(webDist));
  // SPA fallback para cualquier ruta que no sea /api/*
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
