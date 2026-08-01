/**
 * proxy.ts
 * HTTP Basic Auth gate for the whole dashboard.
 *
 * Named `proxy.ts`, not `middleware.ts` — Next.js 16 renamed the file
 * convention (and the exported function) from `middleware` to `proxy`;
 * the AGENTS.md note in this project made a point of flagging that this
 * Next.js version has breaking changes from older docs, and this is one of
 * them. Functionally identical to what "middleware" used to mean.
 *
 * This site shows business data (learning-agent metrics today; usage and
 * advertiser figures later) — it must not be reachable by just knowing the
 * Vercel URL. Basic Auth is deliberately simple: no dependency, works on
 * any Vercel plan, and is enough for a small internal dashboard with one
 * or two viewers. If real advertisers ever get their own login, replace
 * this with proper per-user auth — this is not meant to scale past "the
 * app owner checks this occasionally".
 *
 * Credentials come from environment variables (DASHBOARD_USER /
 * DASHBOARD_PASSWORD), set in the Vercel project settings — never
 * committed to git.
 */

import { NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest) {
  const expectedUser = process.env.DASHBOARD_USER;
  const expectedPass = process.env.DASHBOARD_PASSWORD;

  // Fail CLOSED: if credentials aren't configured, deny everything rather
  // than accidentally serving the dashboard wide open.
  if (!expectedUser || !expectedPass) {
    return new NextResponse('Dashboard not configured', { status: 503 });
  }

  const auth = req.headers.get('authorization');

  if (auth?.startsWith('Basic ')) {
    const decoded = atob(auth.slice('Basic '.length));
    const sep = decoded.indexOf(':');
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (user === expectedUser && pass === expectedPass) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Agent Dashboard"' },
  });
}

export const config = {
  // Everything except Next.js internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
