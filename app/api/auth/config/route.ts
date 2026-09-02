import { getBindings, getRuntimeText } from '@/db/app';

export function GET() {
  getBindings();
  return Response.json(
    { turnstileSiteKey: getRuntimeText('TURNSTILE_SITE_KEY') ?? null },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
