import { ensureAppSchema, getBindings, type UserRecord } from '@/db/app';
import { jsonError } from '@/lib/api';
import { publicUser, requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return jsonError('需要管理员权限。', 403);
  await ensureAppSchema();
  const { db } = getBindings();
  const result = await db
    .prepare(`SELECT id, username, display_name, email, password_hash,
      password_salt, role, status, application_note, created_at,
      approved_at, approved_by, last_login_at
      FROM users ORDER BY
      CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      created_at DESC`)
    .all<UserRecord>();
  return Response.json(
    { users: result.results.map(publicUser) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
