import { connection } from 'next/server';
import { cookies, headers } from 'next/headers';
import { SESSION_COOKIE } from '../auth/session';
import { operatorFromCredentials } from './access';
import { isPublicMode } from './public-mode';

/** The session answer (`/api/auth/session`'s body), computed while the root
 *  layout renders, so the client knows the mode and the caller before its
 *  first paint. Without it the UI would have to wait for (and could fail)
 *  a request just to learn that public mode is off, hiding the admin UI
 *  from a signed-in operator meanwhile.
 *
 *  `connection()` makes the render dynamic, so the flag is read per
 *  request rather than baked in at build time. */
export async function initialSession(): Promise<{
  publicMode: boolean;
  signedIn: boolean;
}> {
  await connection();
  const [c, h] = await Promise.all([cookies(), headers()]);
  return {
    publicMode: isPublicMode(),
    signedIn: await operatorFromCredentials(
      c.get(SESSION_COOKIE)?.value,
      h.get('authorization'),
    ),
  };
}
