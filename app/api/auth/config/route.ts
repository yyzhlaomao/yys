import { getBindings } from '@/db/app';

export function GET() {
  const { runtime } = getBindings();
  return Response.json(
    { turnstileSiteKey: runtime.TURNSTILE_SITE_KEY ?? null },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
