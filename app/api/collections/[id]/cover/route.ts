import { ensureAppSchema, findCollection, getBindings } from '@/db/app';
import { jsonError } from '@/lib/api';
import { requireApprovedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> | { id: string } };
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const ALLOWED_COVERS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const collection = await findCollection(id);
  if (!collection?.cover_object_key)
    return new Response('Not found', { status: 404 });
  const { files } = getBindings();
  const object = await files.get(collection.cover_object_key);
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requireApprovedUser(request);
  if (!user) return jsonError('账号尚未登录或未通过审核。', 403);
  const { id } = await context.params;
  const collection = await findCollection(id);
  if (!collection) return jsonError('没有找到这个收藏夹。', 404);
  if (user.role !== 'admin' && collection.owner_id !== user.id) {
    return jsonError('你不能修改这个收藏夹。', 403);
  }
  const contentType = request.headers.get('content-type')?.split(';')[0] ?? '';
  const extension = ALLOWED_COVERS.get(contentType);
  const size = Number(request.headers.get('content-length') ?? 0);
  if (!extension || !request.body)
    return jsonError('封面需要是 JPG、PNG、WebP 或 AVIF 图片。', 415);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_COVER_BYTES) {
    return jsonError('封面图片不能超过5MB。', 413);
  }

  const key = `covers/${collection.owner_id}/${id}/${crypto.randomUUID()}.${extension}`;
  const { db, files } = getBindings();
  const stored = await files.put(key, request.body, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=86400' },
  });
  if (!stored) return jsonError('封面保存失败。', 500);
  const oldKey = collection.cover_object_key;
  try {
    await ensureAppSchema();
    await db
      .prepare(`UPDATE collections SET cover_object_key = ?1,
        cover_content_type = ?2, updated_at = ?3 WHERE id = ?4`)
      .bind(key, contentType, Date.now(), id)
      .run();
  } catch (error) {
    await files.delete(key);
    throw error;
  }
  if (oldKey) await files.delete(oldKey);
  return Response.json({
    coverUrl: `/api/collections/${id}/cover?v=${Date.now()}`,
  });
}
