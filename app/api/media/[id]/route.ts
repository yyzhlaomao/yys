import { findMedia, getMediaBindings } from '@/db/media';

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
