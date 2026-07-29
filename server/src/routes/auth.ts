import { Router } from 'express';
import passport from 'passport';

export const authRouter = Router();

function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL,
  );
}

authRouter.get('/google', (req, res, next) => {
  if (!isGoogleOAuthConfigured()) {
    res.status(503).json({
      error: { code: 'oauth_not_configured', message: 'Google OAuth no esta configurado en el servidor' },
    });
    return;
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

authRouter.get(
  '/google/callback',
  (req, res, next) => {
    if (!isGoogleOAuthConfigured()) {
      res.status(503).json({
        error: { code: 'oauth_not_configured', message: 'Google OAuth no esta configurado en el servidor' },
      });
      return;
    }
    passport.authenticate('google', {
      failureRedirect: `${process.env.APP_URL ?? ''}/cuenta-no-autorizada`,
    })(req, res, next);
  },
  (_req, res) => {
    res.redirect(process.env.APP_URL ?? '/');
  },
);

authRouter.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) {
      next(err);
      return;
    }
    req.session.destroy(() => {
      res.status(204).end();
    });
  });
});

authRouter.get('/me', (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: { code: 'unauthenticated', message: 'No hay sesion activa' } });
    return;
  }
  res.json({ user: req.user });
});
