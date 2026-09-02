import { ensureAppSchema, getBindings, type UserRecord } from '@/db/app';
import { jsonError, readJson } from '@/lib/api';
import {
  createSession,
  normalizeUsername,
  publicUser,
  validateTurnstile,
  verifyPassword,
} from '@/lib/auth';

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return jsonError('提交内容格式不正确。', 400);
  if (!(await validateTurnstile(request, body.turnstileToken))) {
    return jsonError('人机验证失败，请刷新后重试。', 400);
  }
  const username = normalizeUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  await ensureAppSchema();
  const { db } = getBindings();
  const user = await db
    .prepare(`SELECT id, username, display_name, email, password_hash,
      password_salt, role, status, application_note, created_at,
      approved_at, approved_by, last_login_at
      FROM users WHERE username = ?1 LIMIT 1`)
    .bind(username)
    .first<UserRecord>();

  if (
    !user ||
    !(await verifyPassword(password, user.password_hash, user.password_salt))
  ) {
    return jsonError('用户名或密码不正确。', 401);
  }
  const now = Date.now();
  await db
    .prepare('UPDATE users SET last_login_at = ?1 WHERE id = ?2')
    .bind(now, user.id)
    .run();
  user.last_login_at = now;
  const cookie = await createSession(user.id);
  return Response.json(
    { user: publicUser(user) },
    { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': cookie } },
  );
}
