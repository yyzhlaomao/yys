import { getCurrentUser, publicUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  return Response.json(
    { user: user ? publicUser(user) : null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
