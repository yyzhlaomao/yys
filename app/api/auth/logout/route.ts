import { clearSessionCookie, deleteSession } from '@/lib/auth';

export async function POST(request: Request) {
  await deleteSession(request);
  return Response.json(
    { ok: true },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': clearSessionCookie(),
      },
    },
  );
}
