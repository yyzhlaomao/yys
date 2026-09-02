import { ensureAppSchema, getBindings, type UserStatus } from '@/db/app';
import { jsonError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string }> | { id: string } };
const statuses = new Set<UserStatus>([
  'pending',
  'approved',
  'rejected',
  'suspended',
]);

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireAdmin(request);
  if (!admin) return jsonError('需要管理员权限。', 403);
  const { id } = await context.params;
  if (id === admin.id) return jsonError('不能在这里修改自己的账号状态。', 400);
  const body = await readJson(request);
  const status = body?.status;
  if (typeof status !== 'string' || !statuses.has(status as UserStatus)) {
    return jsonError('账号状态不正确。', 400);
  }

  await ensureAppSchema();
  const { db } = getBindings();
  const now = Date.now();
  const result = await db.batch([
    db
      .prepare(`UPDATE users SET status = ?1,
      approved_at = CASE WHEN ?1 = 'approved' THEN ?2 ELSE approved_at END,
      approved_by = CASE WHEN ?1 = 'approved' THEN ?3 ELSE approved_by END
      WHERE id = ?4 AND role != 'admin'`)
      .bind(status, now, admin.id, id),
    db
      .prepare(`INSERT INTO audit_logs (
      id, actor_user_id, action, target_type, target_id, details, created_at
    ) VALUES (?1, ?2, 'user.status_changed', 'user', ?3, ?4, ?5)`)
      .bind(crypto.randomUUID(), admin.id, id, JSON.stringify({ status }), now),
  ]);
  if (!result[0].meta.changes) return jsonError('没有找到这个账号。', 404);
  if (status !== 'approved') {
    await db.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(id).run();
  }
  return Response.json({ ok: true, status });
}
