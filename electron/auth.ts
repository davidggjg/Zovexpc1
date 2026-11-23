/**
 * Google sign-in for a desktop app: authorization code + PKCE, with the consent
 * page opened in the user's real browser and the result captured on a loopback
 * listener.
 *
 * Google rejects its consent page inside an embedded window
 * ("disallowed_useragent"), and an installed app cannot keep a client secret,
 * so PKCE is the only correct flow here. No secret ships with the app.
 */
import { BrowserWindow, shell } from 'electron';
import crypto from 'node:crypto';
import http from 'node:http';
import { URL } from 'node:url';
import type { GoogleProfile } from '../shared/types';
import { getSettings, setAuth } from './store';

const AUTH_URI = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const USERINFO_URI = 'https://openidconnect.googleapis.com/v1/userinfo';
const SCOPES = 'openid email profile';

const b64url = (buf: Buffer): string => buf.toString('base64url');

function page(title: string, body: string, accent: string): string {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>${title}</title><style>
*{box-sizing:border-box}body{margin:0;height:100vh;display:grid;place-items:center;
background:#0b0d12;color:#e8eaf0;font:16px/1.6 "Segoe UI",system-ui,sans-serif}
.card{text-align:center;padding:48px 56px;border:1px solid #1e2430;border-radius:18px;background:#11151e;max-width:460px}
h1{margin:0 0 10px;font-size:22px;color:${accent}}p{margin:0;color:#98a1b3;font-size:14px}
</style></head><body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}

export interface AuthResult {
  ok: boolean;
  profile?: GoogleProfile;
  error?: string;
}

let activeServer: http.Server | null = null;

export function cancelSignIn(): void {
  try { activeServer?.close(); } catch { /* ignore */ }
  activeServer = null;
}

export async function signInWithGoogle(parent: BrowserWindow | null): Promise<AuthResult> {
  const clientId = getSettings().googleClientId.trim();
  const clientSecret = (getSettings().googleClientSecret ?? '').trim();
  if (!clientId) return { ok: false, error: 'לא הוגדר Client ID של Google בהגדרות' };
  cancelSignIn();

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  return new Promise<AuthResult>((resolve) => {
    let settled = false;
    const finish = (result: AuthResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { server.close(); } catch { /* ignore */ }
      activeServer = null;
      if (result.ok && parent && !parent.isDestroyed()) parent.focus();
      resolve(result);
    };

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const gotState = url.searchParams.get('state');

      if (err || !code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(page('ההתחברות בוטלה', 'אפשר לסגור את החלון הזה ולחזור ל-ZOVEX.', '#ff5a68'));
        finish({ ok: false, error: err === 'access_denied' ? 'ההתחברות בוטלה' : err || 'לא התקבל קוד הרשאה' });
        return;
      }
      if (gotState !== state) {
        // Mismatched state means the response is not ours — never exchange it.
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(page('בקשה לא תקינה', 'נסה להתחבר שוב מתוך האפליקציה.', '#ff5a68'));
        finish({ ok: false, error: 'אימות state נכשל' });
        return;
      }

      // The browser is answered only after the exchange succeeds, so the page
      // never claims success for a sign-in that actually failed.
      const fail = (message: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(page('ההתחברות נכשלה', message, '#ff5a68'));
        finish({ ok: false, error: message });
      };

      try {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        const tokenRes = await fetch(TOKEN_URI, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            ...(clientSecret ? { client_secret: clientSecret } : {}),
            code,
            code_verifier: verifier,
            grant_type: 'authorization_code',
            redirect_uri: `http://127.0.0.1:${port}/callback`,
          }),
        });
        if (!tokenRes.ok) {
          const detail = (await tokenRes.json().catch(() => ({}))) as { error_description?: string; error?: string };
          const why = detail.error_description || detail.error || String(tokenRes.status);
          fail(why.includes('client_secret')
            ? 'חסר Client Secret. הוסף אותו בהגדרות ← שרת ← Google Client Secret ונסה שוב.'
            : `Google דחתה את ההתחברות: ${why}`);
          return;
        }
        const tokens = (await tokenRes.json()) as { access_token?: string };
        if (!tokens.access_token) {
          fail('Google לא החזירה אסימון גישה');
          return;
        }
        const infoRes = await fetch(USERINFO_URI, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        if (!infoRes.ok) {
          fail(`קריאת הפרופיל מ-Google נכשלה (${infoRes.status})`);
          return;
        }
        const info = (await infoRes.json()) as Record<string, string>;
        const profile: GoogleProfile = {
          sub: info.sub ?? '',
          name: info.name ?? '',
          email: info.email ?? '',
          picture: info.picture ?? '',
        };
        // The access token is deliberately discarded: the ZOVEX server does not
        // verify Google tokens, so keeping one on disk would be a liability
        // with no benefit.
        setAuth({ profile, signedInAt: Date.now() });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(page('ההתחברות הושלמה', 'אפשר לסגור את החלון הזה ולחזור ל-ZOVEX.', '#4ade80'));
        finish({ ok: true, profile });
      } catch (e) {
        fail(e instanceof Error ? e.message : 'שגיאת רשת בהתחברות');
      }
    });

    const timeout = setTimeout(() => finish({ ok: false, error: 'תם הזמן להתחברות' }), 5 * 60 * 1000);

    server.on('error', () => finish({ ok: false, error: 'לא ניתן לפתוח מאזין מקומי להתחברות' }));
    server.listen(0, '127.0.0.1', () => {
      activeServer = server;
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const authUrl = `${AUTH_URI}?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: `http://127.0.0.1:${port}/callback`,
        response_type: 'code',
        scope: SCOPES,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'online',
        prompt: 'select_account',
      })}`;
      void shell.openExternal(authUrl);
    });
  });
}

export function signOut(): void {
  cancelSignIn();
  setAuth({ profile: null, signedInAt: null });
}
