import { ensureAppSchema, getBindings, listCollections } from '@/db/app';
import { cleanText, jsonError, readJson } from '@/lib/api';
import { requireApprovedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function responseCollection(
  record: Awaited<ReturnType<typeof listCollections>>[number],
) {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    ownerId: record.owner_id,
    ownerName: record.owner_name,
    mediaCount: Number(record.media_count),
    coverUrl: record.cover_object_key
      ? `/api/collections/${record.id}/cover`
      : null,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mine = url.searchParams.get('mine') === '1';
  let ownerId: string | undefined;
  if (mine) {
    const user = await requireApprovedUser(request);
    if (!user) return jsonError('账号尚未登录或未通过审核。', 403);
    ownerId = user.role === 'admin' ? undefined : user.id;
  }
  const records = await listCollections(ownerId);
  return Response.json(
    { collections: records.map(responseCollection) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const user = await requireApprovedUser(request);
  if (!user) return jsonError('账号尚未登录或未通过审核。', 403);
  const body = await readJson(request);
  const name = cleanText(body?.name, 60);
  const description = cleanText(body?.description, 300) || null;
  if (!name) return jsonError('请填写收藏夹名称。', 400);
  await ensureAppSchema();
  const { db } = getBindings();
  const duplicate = await db
    .prepare(
      'SELECT id FROM collections WHERE owner_id = ?1 AND name = ?2 LIMIT 1',
    )
    .bind(user.id, name)
    .first<{ id: string }>();
  if (duplicate) return jsonError('你已经有同名收藏夹。', 409);
  const id = crypto.randomUUID();
  const now = Date.now();
  await db
    .prepare(`INSERT INTO collections (
      id, name, description, owner_id, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)`)
    .bind(id, name, description, user.id, now)
    .run();
  return Response.json(
    {
      collection: {
        id,
        name,
        description,
        ownerId: user.id,
        ownerName: user.display_name,
        mediaCount: 0,
        coverUrl: null,
        createdAt: now,
        updatedAt: now,
      },
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
