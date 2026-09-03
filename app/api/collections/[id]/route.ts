import { findCollection, getBindings } from '@/db/app';
import { jsonError } from '@/lib/api';
import { requireApprovedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

async function deleteObjects(files: R2Bucket, keys: string[]) {
  for (let offset = 0; offset < keys.length; offset += 1000) {
    await files.delete(keys.slice(offset, offset + 1000));
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await requireApprovedUser(request);
  if (!user) return jsonError('账号尚未登录或未通过审核。', 403);
  const { id } = await context.params;
  const collection = await findCollection(id);
  if (!collection) return jsonError('没有找到这个收藏夹。', 404);
  if (user.role !== 'admin' && collection.owner_id !== user.id) {
    return jsonError('你不能删除这个收藏夹。', 403);
  }

  const { db, files } = getBindings();
  const mediaResult = await db
    .prepare('SELECT object_key FROM media WHERE collection_id = ?1')
    .bind(id)
    .all<{ object_key: string }>();
  const objectKeys = mediaResult.results.map((item) => item.object_key);
  if (collection.cover_object_key) objectKeys.push(collection.cover_object_key);
  const now = Date.now();

  await db.batch([
    db.prepare('DELETE FROM media WHERE collection_id = ?1').bind(id),
    db.prepare('DELETE FROM collections WHERE id = ?1').bind(id),
    db
      .prepare(`INSERT INTO audit_logs (
        id, actor_user_id, action, target_type, target_id, details, created_at
      ) VALUES (?1, ?2, 'collection.delete', 'collection', ?3, ?4, ?5)`)
      .bind(
        crypto.randomUUID(),
        user.id,
        id,
        JSON.stringify({
          name: collection.name,
          deletedMediaCount: mediaResult.results.length,
        }),
        now,
      ),
  ]);

  try {
    await deleteObjects(files, [...new Set(objectKeys)]);
  } catch (error) {
    console.error('Unable to remove deleted collection objects from R2', error);
  }
  return Response.json(
    { ok: true, id, deletedMediaCount: mediaResult.results.length },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
