import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import ConnectPgSimple from 'connect-pg-simple';
import passport from 'passport';
import { configurePassport } from './passport';
import { authRouter } from './routes/auth';

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error('SESSION_SECRET no esta definido');
}

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === 'production';

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
