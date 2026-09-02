import { ensureAppSchema, getBindings } from '@/db/app';
import { cleanText, jsonError, readJson } from '@/lib/api';
import {
  hashPassword,
  normalizeUsername,
  validPassword,
  validUsername,
  validateTurnstile,
} from '@/lib/auth';

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return jsonError('提交内容格式不正确。', 400);
  if (!(await validateTurnstile(request, body.turnstileToken))) {
    return jsonError('人机验证失败，请刷新后重试。', 400);
  }

  const username = normalizeUsername(body.username);
  const displayName = cleanText(body.displayName, 48);
  const email = cleanText(body.email, 160).toLowerCase() || null;
  const note = cleanText(body.applicationNote, 500) || null;
  const password = body.password;

  if (!validUsername(username)) {
    return jsonError('用户名需为3到32个汉字、字母、数字、横线或下划线。', 400);
  }
  if (!displayName) return jsonError('请填写显示名称。', 400);
  if (!validPassword(password)) {
    return jsonError('密码长度需要在10到128个字符之间。', 400);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('邮箱格式不正确。', 400);
  }

  await ensureAppSchema();
  const { db } = getBindings();
  const duplicate = await db
    .prepare(
      'SELECT id FROM users WHERE username = ?1 OR (?2 IS NOT NULL AND email = ?2) LIMIT 1',
    )
    .bind(username, email)
    .first<{ id: string }>();
  if (duplicate) return jsonError('用户名或邮箱已被使用。', 409);

  const passwordResult = await hashPassword(password as string);
  const now = Date.now();
  await db
    .prepare(`INSERT INTO users (
      id, username, display_name, email, password_hash, password_salt,
      role, status, application_note, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'uploader', 'pending', ?7, ?8)`)
    .bind(
      crypto.randomUUID(),
      username,
      displayName,
      email,
      passwordResult.hash,
      passwordResult.salt,
      note,
      now,
    )
    .run();

  return Response.json(
    { ok: true, message: '申请已提交，请等待管理员审核。' },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
