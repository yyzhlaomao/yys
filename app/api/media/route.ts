import { findCollection } from '@/db/app';
import {
  getMediaBindings,
  insertMedia,
  listMedia,
  type MediaRecord,
} from '@/db/media';
import { jsonError } from '@/lib/api';
import { requireApprovedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;
const ALLOWED_MEDIA = new Map<
  string,
  { type: 'image' | 'video'; extension: string }
>([
  ['image/jpeg', { type: 'image', extension: 'jpg' }],
  ['image/png', { type: 'image', extension: 'png' }],
  ['image/webp', { type: 'image', extension: 'webp' }],
  ['image/gif', { type: 'image', extension: 'gif' }],
  ['image/avif', { type: 'image', extension: 'avif' }],
  ['video/mp4', { type: 'video', extension: 'mp4' }],
  ['video/webm', { type: 'video', extension: 'webm' }],
  ['video/quicktime', { type: 'video', extension: 'mov' }],
  ['video/ogg', { type: 'video', extension: 'ogv' }],
]);

function responseMedia(record: MediaRecord) {
  return {
    id: record.id,
    name: record.original_name,
    type: record.media_type,
    contentType: record.content_type,
    size: record.size,
    uploaderId: record.uploader_id,
    uploaderName: record.uploader_name,
    collectionId: record.collection_id,
    collectionName: record.collection_name,
    createdAt: record.created_at,
    url: `/api/media/${record.id}`,
  };
}

function decodeFilename(value: string | null) {
  if (!value) return '未命名作品';
  try {
    const cleanName = Array.from(decodeURIComponent(value))
      .filter((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code >= 32 && code !== 127;
      })
      .join('')
      .trim()
      .slice(0, 180);
    return cleanName || '未命名作品';
  } catch {
    return '未命名作品';
  }
}

export async function GET() {
  try {
    const records = await listMedia();
    return Response.json(
      { media: records.map(responseMedia) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Unable to list media', error);
    return jsonError('暂时无法读取画廊，请稍后重试。', 500);
  }
}

export async function POST(request: Request) {
  const user = await requireApprovedUser(request);
  if (!user) return jsonError('账号尚未登录或未通过审核。', 403);
  const collectionId = request.headers.get('x-collection-id') ?? '';
  if (!collectionId) return jsonError('上传前请选择收藏夹。', 400);
  const collection = await findCollection(collectionId);
  if (!collection) return jsonError('没有找到所选收藏夹。', 404);
  if (user.role !== 'admin' && collection.owner_id !== user.id) {
    return jsonError('你不能上传到这个收藏夹。', 403);
  }

  const contentType =
    request.headers.get('content-type')?.split(';')[0].toLowerCase() ?? '';
  const mediaKind = ALLOWED_MEDIA.get(contentType);
  if (!mediaKind) return jsonError('仅支持常见的网页图片与视频格式。', 415);
  if (!request.body) return jsonError('没有收到文件内容。', 400);
  const declaredSize = Number(
    request.headers.get('x-file-size') ??
      request.headers.get('content-length') ??
      0,
  );
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
    return jsonError('无法确认文件大小。', 400);
  }
  if (declaredSize > MAX_UPLOAD_BYTES) {
    return jsonError('单个文件不能超过95MB。', 413);
  }

  const id = crypto.randomUUID();
  const key = `media/${user.id}/${new Date().getUTCFullYear()}/${String(new Date().getUTCMonth() + 1).padStart(2, '0')}/${id}.${mediaKind.extension}`;
  const originalName = decodeFilename(request.headers.get('x-file-name'));
  const createdAt = Date.now();
  const { files } = getMediaBindings();

  try {
    const stored = await files.put(key, request.body, {
      httpMetadata: {
        contentType,
        contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(originalName)}`,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        originalName,
        mediaType: mediaKind.type,
        uploaderId: user.id,
        collectionId,
      },
    });
    if (!stored) return jsonError('文件保存失败，请重试。', 500);
    if (stored.size > MAX_UPLOAD_BYTES) {
      await files.delete(key);
      return jsonError('单个文件不能超过95MB。', 413);
    }

    const record: MediaRecord = {
      id,
      object_key: key,
      original_name: originalName,
      media_type: mediaKind.type,
      content_type: contentType,
      size: stored.size,
      uploader_id: user.id,
      uploader_name: user.display_name,
      collection_id: collection.id,
      collection_name: collection.name,
      created_at: createdAt,
      updated_at: createdAt,
    };
    try {
      await insertMedia(record);
    } catch (error) {
      await files.delete(key);
      throw error;
    }
    return Response.json(
      { media: responseMedia(record) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Unable to upload media', error);
    return jsonError('上传没有完成，请稍后重试。', 500);
  }
}
