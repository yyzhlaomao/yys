'use client';

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FolderHeart,
  Images,
  ImagePlus,
  LoaderCircle,
  Plus,
  Trash2,
  UploadCloud,
  Video,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { SiteHeader } from '@/components/site-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import type {
  CollectionItem,
  CurrentUser,
  MediaItem,
} from '@/lib/client-types';

type UploadItem = {
  id: string;
  file: File;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
};

type DeleteTarget =
  | { kind: 'collection'; item: CollectionItem }
  | { kind: 'media'; item: MediaItem };

const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/ogg',
]);

function uploadFile(
  file: File,
  collectionId: string,
  onProgress: (progress: number) => void,
): Promise<MediaItem> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/media');
    request.setRequestHeader('Content-Type', file.type);
    request.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    request.setRequestHeader('X-File-Size', String(file.size));
    request.setRequestHeader('X-Collection-Id', collectionId);
    request.upload.onprogress = (event) =>
      event.lengthComputable &&
      onProgress(Math.round((event.loaded / event.total) * 100));
    request.onerror = () => reject(new Error('网络连接中断，请重试。'));
    request.onload = () => {
      let payload: { media?: MediaItem; error?: string } = {};
      try {
        payload = JSON.parse(request.responseText) as typeof payload;
      } catch {
        /* status gives fallback */
      }
      if (request.status >= 200 && request.status < 300 && payload.media)
        resolve(payload.media);
      else reject(new Error(payload.error ?? `上传失败（${request.status}）`));
    };
    request.send(file);
  });
}

async function readPayload<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export function UploadWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [openedCollectionId, setOpenedCollectionId] = useState('');
  const [collectionMedia, setCollectionMedia] = useState<MediaItem[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState('');
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const selectedCollectionItem = collections.find(
    (collection) => collection.id === selectedCollection,
  );
  const openedCollection = collections.find(
    (collection) => collection.id === openedCollectionId,
  );
  const selectedMedia = collectionMedia.find(
    (media) => media.id === selectedMediaId,
  );
  const deleteTarget: DeleteTarget | null = openedCollection
    ? selectedMedia
      ? { kind: 'media', item: selectedMedia }
      : null
    : selectedCollectionItem
      ? { kind: 'collection', item: selectedCollectionItem }
      : null;
  const canDeleteTarget = Boolean(
    user &&
    deleteTarget &&
    (user.role === 'admin' ||
      (deleteTarget.kind === 'collection'
        ? deleteTarget.item.ownerId === user.id
        : deleteTarget.item.uploaderId === user.id ||
          openedCollection?.ownerId === user.id)),
  );
  const hasActiveUploads = uploads.some(
    (item) => item.status === 'queued' || item.status === 'uploading',
  );

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me', { cache: 'no-store' }).then(
        (response) => response.json() as Promise<{ user?: CurrentUser | null }>,
      ),
      fetch('/api/collections?mine=1', { cache: 'no-store' }).then(
        async (response) => {
          const data = (await response.json()) as {
            collections?: CollectionItem[];
            error?: string;
          };
          if (!response.ok) throw new Error(data.error ?? '无法读取收藏夹。');
          return data;
        },
      ),
    ])
      .then(([auth, collectionData]) => {
        const currentUser = auth.user ?? null;
        setUser(currentUser);
        if (!currentUser) {
          window.location.href = '/login?returnTo=/upload';
          return;
        }
        if (currentUser.status !== 'approved') {
          setError('你的账号尚未通过审核，目前不能上传。');
          return;
        }
        const items = collectionData.collections ?? [];
        setCollections(items);
        if (items[0]) setSelectedCollection(items[0].id);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : '上传工作区暂时不可用。',
        ),
      )
      .finally(() => setIsLoading(false));
  }, []);

  function updateUpload(id: string, patch: Partial<UploadItem>) {
    setUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function beginUpload(files: File[]) {
    if (!selectedCollection) {
      setError('请先选择或创建一个收藏夹。');
      return;
    }
    const queue = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      status: 'queued' as const,
    }));
    setUploads((current) => [...queue, ...current].slice(0, 30));
    for (const queued of queue) {
      if (!ACCEPTED_TYPES.has(queued.file.type)) {
        updateUpload(queued.id, {
          status: 'error',
          error: '不支持这个文件格式。',
        });
        continue;
      }
      if (!queued.file.size || queued.file.size > MAX_UPLOAD_BYTES) {
        updateUpload(queued.id, {
          status: 'error',
          error: '文件需要小于95MB。',
        });
        continue;
      }
      updateUpload(queued.id, { status: 'uploading', progress: 1 });
      try {
        await uploadFile(queued.file, selectedCollection, (progress) =>
          updateUpload(queued.id, { progress }),
        );
        setCollections((current) =>
          current.map((collection) =>
            collection.id === selectedCollection
              ? { ...collection, mediaCount: collection.mediaCount + 1 }
              : collection,
          ),
        );
        updateUpload(queued.id, { status: 'done', progress: 100 });
      } catch (reason) {
        updateUpload(queued.id, {
          status: 'error',
          error: reason instanceof Error ? reason.message : '上传失败。',
        });
      }
    }
  }

  async function createCollection(
    event: React.SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!name.trim()) return;
    setIsCreating(true);
    setError('');
    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const payload = (await response.json()) as {
        collection?: CollectionItem;
        error?: string;
      };
      if (!response.ok || !payload.collection)
        throw new Error(payload.error ?? '创建收藏夹失败。');
      let item = payload.collection;
      if (cover) {
        const coverResponse = await fetch(`/api/collections/${item.id}/cover`, {
          method: 'POST',
          headers: { 'Content-Type': cover.type },
          body: cover,
        });
        const coverPayload = (await coverResponse.json()) as {
          coverUrl?: string;
          error?: string;
        };
        if (!coverResponse.ok)
          throw new Error(
            coverPayload.error ?? '收藏夹已创建，但封面上传失败。',
          );
        item = { ...item, coverUrl: coverPayload.coverUrl ?? null };
      }
      setCollections((current) => [item, ...current]);
      setSelectedCollection(item.id);
      setName('');
      setDescription('');
      setCover(null);
      setShowCreate(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建收藏夹失败。');
    } finally {
      setIsCreating(false);
    }
  }

  async function openCollection(collection: CollectionItem) {
    setSelectedCollection(collection.id);
    setOpenedCollectionId(collection.id);
    setSelectedMediaId('');
    setCollectionMedia([]);
    setIsLoadingMedia(true);
    setError('');
    try {
      const response = await fetch(
        `/api/media?collectionId=${encodeURIComponent(collection.id)}`,
        { cache: 'no-store' },
      );
      const payload = await readPayload<{
        media?: MediaItem[];
        error?: string;
      }>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? '无法读取收藏夹内容。');
      }
      setCollectionMedia(payload.media ?? []);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '无法读取收藏夹内容。',
      );
    } finally {
      setIsLoadingMedia(false);
    }
  }

  async function deleteSelected() {
    if (!deleteTarget || !canDeleteTarget) return;
    setIsDeleting(true);
    setError('');
    try {
      const endpoint =
        deleteTarget.kind === 'collection'
          ? `/api/collections/${deleteTarget.item.id}`
          : `/api/media/${deleteTarget.item.id}`;
      const response = await fetch(endpoint, { method: 'DELETE' });
      const payload = await readPayload<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? '删除没有完成，请稍后重试。');
      }

      if (deleteTarget.kind === 'collection') {
        const remaining = collections.filter(
          (collection) => collection.id !== deleteTarget.item.id,
        );
        setCollections(remaining);
        setSelectedCollection(remaining[0]?.id ?? '');
        setOpenedCollectionId('');
        setCollectionMedia([]);
        setSelectedMediaId('');
        setUploads([]);
      } else {
        const collectionId = deleteTarget.item.collectionId;
        setCollectionMedia((current) =>
          current.filter((media) => media.id !== deleteTarget.item.id),
        );
        setSelectedMediaId('');
        if (collectionId) {
          setCollections((current) =>
            current.map((collection) =>
              collection.id === collectionId
                ? {
                    ...collection,
                    mediaCount: Math.max(0, collection.mediaCount - 1),
                  }
                : collection,
            ),
          );
        }
      }
      setDeleteDialogOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除没有完成。');
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen">
        <SiteHeader backToGallery />
        <div className="grid min-h-[60vh] place-items-center">
          <LoaderCircle className="size-7 animate-spin text-primary" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader backToGallery />
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/*,video/mp4,video/webm,video/quicktime,video/ogg"
        multiple
        onChange={(event) => {
          void beginUpload(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <input
        ref={coverRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={(event) => {
          setCover(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />

      <section className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8 lg:px-12">
        <div className="max-w-2xl">
          <p className="eyebrow">上传工作区</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">
            把新的记忆，放进它的位置。
          </h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground">
            先选择收藏夹，再批量上传图片或视频。上传完成后，作品会自动回到公开画廊。
          </p>
        </div>

        {error && (
          <div className="mt-7 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}

        {user?.status === 'approved' && openedCollection && (
          <section className="mt-10 rounded-[1.75rem] border border-border bg-card p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <Button
                  variant="ghost"
                  className="-ml-2 rounded-full"
                  type="button"
                  onClick={() => {
                    setOpenedCollectionId('');
                    setSelectedMediaId('');
                    setCollectionMedia([]);
                    setError('');
                  }}
                >
                  <ArrowLeft data-icon="inline-start" />
                  返回上传界面
                </Button>
                <p className="eyebrow mt-5">收藏夹内容</p>
                <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">
                  {openedCollection.name}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {openedCollection.description ||
                    `${collectionMedia.length} 件作品，单击作品后可删除。`}
                </p>
              </div>
              <div className="rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground">
                {collectionMedia.length} 件作品
              </div>
            </div>

            {isLoadingMedia ? (
              <div className="grid min-h-72 place-items-center">
                <LoaderCircle className="size-7 animate-spin text-primary" />
              </div>
            ) : collectionMedia.length ? (
              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {collectionMedia.map((media) => {
                  const isSelected = selectedMediaId === media.id;
                  return (
                    <button
                      className={`group relative aspect-[4/3] overflow-hidden rounded-2xl border bg-secondary text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isSelected
                          ? 'border-destructive ring-2 ring-destructive/40'
                          : 'border-border hover:border-foreground/30'
                      }`}
                      type="button"
                      key={media.id}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelectedMediaId(isSelected ? '' : media.id);
                        setError('');
                      }}
                    >
                      {media.type === 'image' ? (
                        // oxlint-disable-next-line next/no-img-element
                        <img
                          className="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
                          src={media.url}
                          alt={media.name}
                          loading="lazy"
                        />
                      ) : (
                        <>
                          <video
                            className="size-full object-cover"
                            src={media.url}
                            preload="metadata"
                            muted
                            playsInline
                          />
                          <span className="absolute left-3 top-3 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                            <Video className="size-4" />
                          </span>
                        </>
                      )}
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-9 text-sm font-medium text-white">
                        <span className="block truncate">{media.name}</span>
                      </span>
                      {isSelected && (
                        <span className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-destructive text-white shadow-sm">
                          <CheckCircle2 className="size-4" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-7 grid min-h-72 place-items-center rounded-2xl border border-dashed border-border bg-secondary/30 p-8 text-center">
                <div>
                  <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
                    <Images className="size-6" />
                  </span>
                  <h3 className="mt-4 font-semibold">这个收藏夹还没有作品</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    返回上传界面，即可把图片或视频添加进来。
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {user?.status === 'approved' && !openedCollection && (
          <div className="mt-10 grid gap-7 lg:grid-cols-[0.82fr_1.18fr]">
            <section className="rounded-[1.75rem] border border-border bg-card p-5 shadow-sm sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="eyebrow">第一步</p>
                  <h2 className="mt-2 text-xl font-semibold">选择收藏夹</h2>
                </div>
                <Button
                  variant="outline"
                  className="rounded-full"
                  type="button"
                  onClick={() => setShowCreate((value) => !value)}
                >
                  <Plus data-icon="inline-start" />
                  新建
                </Button>
              </div>

              {showCreate && (
                <form
                  className="mt-5 space-y-4 rounded-2xl bg-secondary/55 p-4"
                  onSubmit={(event) => void createCollection(event)}
                >
                  <div>
                    <label
                      className="mb-1.5 block text-sm font-medium"
                      htmlFor="collection-name"
                    >
                      名称
                    </label>
                    <Input
                      id="collection-name"
                      className="h-10"
                      value={name}
                      maxLength={60}
                      onChange={(event) => setName(event.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-sm font-medium"
                      htmlFor="collection-description"
                    >
                      简介
                    </label>
                    <Textarea
                      id="collection-description"
                      value={description}
                      maxLength={300}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </div>
                  <button
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-background p-3 text-left text-sm"
                    type="button"
                    onClick={() => coverRef.current?.click()}
                  >
                    <ImagePlus className="size-5 text-primary" />
                    <span className="min-w-0">
                      <strong className="block">选择封面</strong>
                      <small className="block truncate text-muted-foreground">
                        {cover?.name ?? 'JPG、PNG、WebP，最大5MB'}
                      </small>
                    </span>
                  </button>
                  <Button
                    className="w-full rounded-xl"
                    type="submit"
                    disabled={isCreating}
                  >
                    {isCreating && <LoaderCircle className="animate-spin" />}
                    创建收藏夹
                  </Button>
                </form>
              )}

              <div className="mt-5 space-y-2">
                {collections.length ? (
                  collections.map((collection) => (
                    <button
                      className={`collection-choice ${selectedCollection === collection.id ? 'is-selected' : ''}`}
                      type="button"
                      key={collection.id}
                      onClick={() => {
                        setSelectedCollection(collection.id);
                        setError('');
                      }}
                      onDoubleClick={() => void openCollection(collection)}
                    >
                      <span className="collection-choice-cover">
                        {collection.coverUrl ? (
                          // oxlint-disable-next-line next/no-img-element
                          <img src={collection.coverUrl} alt="" />
                        ) : (
                          <FolderHeart />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate">
                          {collection.name}
                        </strong>
                        <small className="text-muted-foreground">
                          {collection.mediaCount} 件作品 · 双击查看
                        </small>
                      </span>
                      {selectedCollection === collection.id && (
                        <CheckCircle2 className="size-5 text-primary" />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
                    先创建第一个收藏夹，再开始上传。
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-border bg-card p-5 shadow-sm sm:p-7">
              <div>
                <p className="eyebrow">第二步</p>
                <h2 className="mt-2 text-xl font-semibold">选择图片与视频</h2>
              </div>
              <button
                className={`upload-dropzone mt-5 ${isDragging ? 'is-dragging' : ''}`}
                type="button"
                disabled={!selectedCollection}
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  void beginUpload(Array.from(event.dataTransfer.files));
                }}
              >
                <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
                  <UploadCloud className="size-6" />
                </span>
                <strong className="mt-4 text-lg">
                  {selectedCollection ? '拖放文件到这里' : '请先选择收藏夹'}
                </strong>
                <span className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  支持常见图片、MP4、WebM 和 MOV，单个文件不超过95MB
                </span>
                <span className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
                  选择文件
                </span>
              </button>

              {uploads.length > 0 && (
                <div className="mt-5 space-y-3">
                  {uploads.map((item) => (
                    <div
                      className="rounded-xl border border-border/75 bg-background p-3"
                      key={item.id}
                    >
                      <div className="flex items-center gap-3">
                        {item.status === 'done' ? (
                          <CheckCircle2 className="size-5 shrink-0 text-primary" />
                        ) : item.status === 'error' ? (
                          <AlertCircle className="size-5 shrink-0 text-destructive" />
                        ) : (
                          <LoaderCircle
                            className={`size-5 shrink-0 ${item.status === 'uploading' ? 'animate-spin' : ''}`}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-3">
                            <span className="truncate text-sm font-medium">
                              {item.file.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {item.status === 'error'
                                ? '失败'
                                : `${item.progress}%`}
                            </span>
                          </div>
                          {item.status === 'error' ? (
                            <p className="mt-1 text-xs text-destructive">
                              {item.error}
                            </p>
                          ) : (
                            <Progress className="mt-2" value={item.progress} />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {user?.status === 'approved' && deleteTarget && canDeleteTarget && (
          <>
            <Button
              variant="destructive"
              className="fixed bottom-6 right-6 z-40 h-12 rounded-full border border-destructive/20 bg-background px-5 shadow-xl shadow-black/15 backdrop-blur sm:bottom-8 sm:right-8"
              type="button"
              disabled={hasActiveUploads || isDeleting}
              title={hasActiveUploads ? '请等待当前上传完成' : undefined}
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 data-icon="inline-start" />
              {deleteTarget.kind === 'collection' ? '删除收藏夹' : '删除作品'}
            </Button>

            <AlertDialog
              open={deleteDialogOpen}
              onOpenChange={(open) => {
                if (!isDeleting) setDeleteDialogOpen(open);
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-destructive/10 text-destructive">
                    <Trash2 />
                  </AlertDialogMedia>
                  <AlertDialogTitle>
                    {deleteTarget.kind === 'collection'
                      ? '确认删除这个收藏夹？'
                      : '确认删除这件作品？'}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {deleteTarget.kind === 'collection'
                      ? `这会永久删除“${deleteTarget.item.name}”、收藏夹封面以及其中 ${deleteTarget.item.mediaCount} 件作品，删除后无法恢复。`
                      : `这会永久删除“${deleteTarget.item.name}”，删除后无法恢复。`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>
                    取消
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={isDeleting}
                    onClick={() => void deleteSelected()}
                  >
                    {isDeleting ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                    确认删除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </section>
    </main>
  );
}
