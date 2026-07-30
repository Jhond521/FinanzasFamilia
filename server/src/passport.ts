import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from './lib/prisma';
import { isEmailAllowed, parseAllowedEmails } from './services/auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User {
      id: string;
      name: string;
      email: string;
    }
  }
}

export function configurePassport(): void {
  const allowedEmails = parseAllowedEmails(process.env.ALLOWED_EMAILS);
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URL) {
    console.warn(
      'Google OAuth no esta configurado (GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL) — /api/auth/google no funcionara hasta configurarlo.',
    );
  } else {
    passport.use(
      new GoogleStrategy(
        {
          clientID: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
          callbackURL: GOOGLE_CALLBACK_URL,
        },
        (_accessToken, _refreshToken, profile, done) => {
          void (async () => {
  const email = profile.emails?.[0]?.value?.toLowerCase();
            console.log('[auth debug] verify callback', { email, allowedEmails });
            if (!email || !isEmailAllowed(email, allowedEmails)) {
              console.log('[auth debug] email not allowed', { email });
              done(null, false);
              return;
            }

            // El usuario ya debe existir (creado por el seed): no hay registro publico.
            const user = await prisma.user.findUnique({ where: { email } });
            console.log('[auth debug] user lookup', { email, found: Boolean(user) });
            if (!user) {
              done(null, false);
              return;
            }

            done(null, { id: user.id, name: user.name, email: user.email });
          })().catch(done);
        },
      ),
    );
  }

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser((id: string, done) => {
    void prisma.user
      .findUnique({ where: { id } })
      .then((user) => {
        console.log('[auth debug] deserializeUser', { id, found: Boolean(user) });
        if (!user) {
          done(null, false);
          return;
        }
        done(null, { id: user.id, name: user.name, email: user.email });
      })
      .catch((err: unknown) => {
        console.log('[auth debug] deserializeUser error', err instanceof Error ? err.message : err);
        done(err);
      });
  });
}
