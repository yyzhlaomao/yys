import { RELEASE } from '@/lib/release';

export function GET() {
  return Response.json(
    { release: RELEASE },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
