import { findCollection } from '@/db/app';
import { findMedia, getMediaBindings } from '@/db/media';
import { jsonError } from '@/lib/api';
import { requireApprovedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const record = await findMedia(id);
    if (!record) {
      return new Response('Not found', { status: 404 });
    }

    const { files } = getMediaBindings();
    const wantsRange = request.headers.has('range');
    const object = await files.get(
      record.object_key,
      wantsRange ? { range: request.headers } : undefined,
    );

    if (!object || !('body' in object)) {
      return new Response('Not found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options', 'nosniff');

    let status = 200;
    const range = object.range as
      | { offset: number; length: number }
      | undefined;
    if (wantsRange && range) {
      status = 206;
      headers.set(
        'Content-Range',
        `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`,
      );
      headers.set('Content-Length', String(range.length));
    } else {
      headers.set('Content-Length', String(object.size));
    }

    return new Response(object.body, { status, headers });
  } catch (error) {
    console.error('Unable to read media', error);
    return new Response('Unable to read media', { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await requireApprovedUser(request);
  if (!user) return jsonError('账号尚未登录或未通过审核。', 403);
  const { id } = await context.params;
  const record = await findMedia(id);
  if (!record) return jsonError('没有找到这项作品。', 404);

  let canDelete = user.role === 'admin' || record.uploader_id === user.id;
  if (!canDelete && record.collection_id) {
    const collection = await findCollection(record.collection_id);
    canDelete = collection?.owner_id === user.id;
  }
  if (!canDelete) return jsonError('你不能删除这项作品。', 403);

  const { db, files } = getMediaBindings();
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM media WHERE id = ?1').bind(id),
    ...(record.collection_id
      ? [
          db
            .prepare('UPDATE collections SET updated_at = ?1 WHERE id = ?2')
            .bind(now, record.collection_id),
        ]
      : []),
    db
      .prepare(`INSERT INTO audit_logs (
        id, actor_user_id, action, target_type, target_id, details, created_at
      ) VALUES (?1, ?2, 'media.delete', 'media', ?3, ?4, ?5)`)
      .bind(
        crypto.randomUUID(),
        user.id,
        id,
        JSON.stringify({ name: record.original_name }),
        now,
      ),
  ]);

  try {
    await files.delete(record.object_key);
  } catch (error) {
    console.error('Unable to remove deleted media from R2', error);
  }
  return Response.json(
    { ok: true, id },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
