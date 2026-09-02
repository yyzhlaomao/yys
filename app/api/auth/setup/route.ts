import { ensureAppSchema, getBindings, getRuntimeText } from '@/db/app';
import { cleanText, jsonError, readJson } from '@/lib/api';
import {
  createSession,
  hashPassword,
  normalizeUsername,
  validPassword,
  validUsername,
} from '@/lib/auth';

export async function GET() {
  await ensureAppSchema();
  const { db } = getBindings();
  const admin = await db
    .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    .first<{ id: string }>();
  return Response.json(
    { setupAvailable: !admin },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  try {
    return await createFirstAdmin(request);
  } catch (error) {
    console.error('Administrator setup failed.', error);
    return jsonError('服务器未能完成管理员创建，请稍后重试。', 500);
  }
}

async function createFirstAdmin(request: Request) {
  const body = await readJson(request);
  if (!body) return jsonError('提交内容格式不正确。', 400);
  await ensureAppSchema();
  const { db } = getBindings();
  const setupToken = getRuntimeText('ADMIN_SETUP_TOKEN');
  if (!setupToken) {
    return jsonError('管理员初始化令牌尚未配置。', 503);
  }
  if (body.setupToken !== setupToken) {
    return jsonError('初始化令牌不正确。', 403);
  }
  const existing = await db
    .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    .first<{ id: string }>();
  if (existing) return jsonError('管理员已经创建，初始化入口已关闭。', 409);

  const username = normalizeUsername(body.username);
  const displayName = cleanText(body.displayName, 48);
  const password = body.password;
  if (!validUsername(username) || !displayName || !validPassword(password)) {
    return jsonError('请检查用户名、显示名称和密码。密码至少10个字符。', 400);
  }
  const passwordResult = await hashPassword(password as string);
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db
      .prepare(`INSERT INTO users (
      id, username, display_name, password_hash, password_salt,
      role, status, created_at, approved_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, 'admin', 'approved', ?6, ?6)`)
      .bind(
        id,
        username,
        displayName,
        passwordResult.hash,
        passwordResult.salt,
        now,
      ),
    db
      .prepare(`INSERT INTO audit_logs (
      id, actor_user_id, action, target_type, target_id, details, created_at
    ) VALUES (?1, ?2, 'admin.setup', 'user', ?2, NULL, ?3)`)
      .bind(crypto.randomUUID(), id, now),
  ]);
  const cookie = await createSession(id);
  return Response.json(
    { ok: true },
    {
      status: 201,
      headers: { 'Cache-Control': 'no-store', 'Set-Cookie': cookie },
    },
  );
}
