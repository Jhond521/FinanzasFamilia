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
    }, (err: unknown, user: Express.User | false | null) => {
      console.log('[auth debug] authenticate callback', {
        err: err instanceof Error ? err.message : err,
        hasUser: Boolean(user),
        sessionID: req.sessionID,
      });
      if (err) {
        next(err);
        return;
      }
      if (!user) {
        res.redirect(`${process.env.APP_URL ?? ''}/cuenta-no-autorizada`);
        return;
      }
      req.logIn(user, (loginErr) => {
        console.log('[auth debug] req.logIn result', {
          loginErr: loginErr instanceof Error ? loginErr.message : loginErr,
          sessionID: req.sessionID,
        });
        if (loginErr) {
          next(loginErr);
          return;
        }
        req.session.save((saveErr) => {
          console.log('[auth debug] session.save result', {
            saveErr: saveErr instanceof Error ? saveErr.message : saveErr,
            sessionID: req.sessionID,
          });
          next();
        });
      });
    })(req, res, next);
  },
  (req, res) => {
    console.log('[auth debug] redirecting to app', { sessionID: req.sessionID, user: req.user });
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
