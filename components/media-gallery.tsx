'use client';

import {
  AlertCircle,
  CheckCircle2,
  ImageIcon,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  UploadCloud,
  Video,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

type MediaType = 'image' | 'video';
type Filter = 'all' | MediaType;

type MediaItem = {
  id: string;
  name: string;
  type: MediaType;
  contentType: string;
  size: number;
  createdAt: number;
  url: string;
};

type UploadItem = {
  id: string;
  file: File;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
};

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

const filters: Array<{
  value: Filter;
  label: string;
  icon?: typeof ImageIcon;
}> = [
  { value: 'all', label: '全部' },
  { value: 'image', label: '图片', icon: ImageIcon },
  { value: 'video', label: '视频', icon: Video },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function uploadFile(
  file: File,
  onProgress: (progress: number) => void,
): Promise<MediaItem> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/media');
    request.setRequestHeader('Content-Type', file.type);
    request.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    request.setRequestHeader('X-File-Size', String(file.size));

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onerror = () => reject(new Error('网络连接中断，请重试。'));
    request.onload = () => {
      let payload: { media?: MediaItem; error?: string } = {};
      try {
        payload = JSON.parse(request.responseText) as typeof payload;
      } catch {
        // The status code below still gives a useful fallback error.
      }

      if (request.status >= 200 && request.status < 300 && payload.media) {
        resolve(payload.media);
      } else {
        reject(new Error(payload.error ?? `上传失败（${request.status}）`));
      }
    };

    request.send(file);
  });
}

export function MediaGallery() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    fetch('/api/media', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as {
          media?: MediaItem[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? '读取画廊失败。');
        return payload.media ?? [];
      })
      .then((items) => {
        if (active) setMedia(items);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : '读取画廊失败。',
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const visibleMedia = useMemo(
    () =>
      filter === 'all' ? media : media.filter((item) => item.type === filter),
    [filter, media],
  );

  const imageCount = media.filter((item) => item.type === 'image').length;
  const videoCount = media.length - imageCount;

  function updateUpload(id: string, patch: Partial<UploadItem>) {
    setUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function beginUpload(files: File[]) {
    if (!files.length) return;

    const queue = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      status: 'queued' as const,
    }));
    setUploads((current) => [...queue, ...current].slice(0, 24));

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
          error: '文件需要小于 95 MB。',
        });
        continue;
      }

      updateUpload(queued.id, { status: 'uploading', progress: 1 });
      try {
        const item = await uploadFile(queued.file, (progress) =>
          updateUpload(queued.id, { progress }),
        );
        setMedia((current) => [item, ...current]);
        updateUpload(queued.id, { status: 'done', progress: 100 });
        window.setTimeout(() => {
          setUploads((current) =>
            current.filter((entry) => entry.id !== queued.id),
          );
        }, 2600);
      } catch (error) {
        updateUpload(queued.id, {
          status: 'error',
          error: error instanceof Error ? error.message : '上传失败，请重试。',
        });
      }
    }
  }

  function openPicker() {
    inputRef.current?.click();
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <input
        ref={inputRef}
        id="media-input"
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,video/ogg"
        multiple
        onChange={(event) => {
          void beginUpload(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />

      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/86 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1500px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <a
            className="group flex items-center gap-3"
            href="#top"
            aria-label="光影集首页"
          >
            <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_color-mix(in_oklch,var(--primary),transparent_72%)] transition-transform group-hover:-rotate-3">
              <Play className="size-4 fill-current" />
            </span>
            <span>
              <strong className="block text-base leading-none tracking-[-0.03em]">
                光影集
              </strong>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Media Gallery
              </span>
            </span>
          </a>

          <Button
            className="h-10 rounded-full px-4 shadow-sm"
            type="button"
            onClick={openPicker}
          >
            <Plus data-icon="inline-start" />
            上传作品
          </Button>
        </div>
      </header>

      <section
        id="top"
        className="mx-auto max-w-[1500px] scroll-mt-24 px-5 pb-16 pt-9 sm:px-8 sm:pt-12 lg:px-12"
      >
        <div className="grid items-end gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.72fr)]">
          <div>
            <p className="eyebrow">你的私人影像空间</p>
            <h1 className="mt-4 max-w-3xl text-balance text-[clamp(2.7rem,7vw,6.6rem)] font-semibold leading-[0.9] tracking-[-0.07em]">
              每一帧，
              <span className="text-primary">都有位置。</span>
            </h1>
            <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
              上传照片和视频，画廊会根据内容比例自动排列。无需裁切，也无需手动整理。
            </p>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              <span>
                <b className="mr-1 text-foreground">{media.length}</b> 件作品
              </span>
              <span>
                <b className="mr-1 text-foreground">{imageCount}</b> 张图片
              </span>
              <span>
                <b className="mr-1 text-foreground">{videoCount}</b> 段视频
              </span>
            </div>
          </div>

          <section
            className={`upload-panel group relative overflow-hidden rounded-[2rem] border bg-card p-5 shadow-[0_24px_80px_rgb(28_35_33/8%)] transition-all sm:p-7 ${isDragging ? 'is-dragging border-primary' : 'border-border'}`}
            aria-label="文件上传区"
          >
            <div className="upload-grid absolute inset-0 opacity-55" />
            <button
              className="relative flex min-h-56 w-full cursor-pointer flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-primary/35 bg-background/72 px-6 py-10 text-center transition-colors group-hover:border-primary/60 group-hover:bg-background"
              type="button"
              onClick={openPicker}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                const nextTarget = event.relatedTarget;
                if (
                  !(nextTarget instanceof Node) ||
                  !event.currentTarget.contains(nextTarget)
                ) {
                  setIsDragging(false);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragging(false);
                void beginUpload(Array.from(event.dataTransfer.files));
              }}
            >
              <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
                <UploadCloud className="size-6" />
              </span>
              <h2 className="mt-5 text-lg font-semibold tracking-tight">
                {isDragging ? '松开即可开始上传' : '拖放图片或视频到这里'}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                支持 JPG、PNG、WebP、GIF、AVIF、MP4、WebM，单个不超过 95 MB
              </p>
              <span className="mt-6 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm">
                选择文件
              </span>
            </button>
          </section>
        </div>

        {uploads.length > 0 && (
          <section
            className="mt-8 rounded-[1.5rem] border border-border bg-card p-4 shadow-sm sm:p-5"
            aria-label="上传进度"
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold">上传队列</h2>
              <span className="text-xs text-muted-foreground">
                请保持页面开启直到上传完成
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {uploads.map((item) => (
                <div
                  className="rounded-xl border border-border/75 bg-background p-3"
                  key={item.id}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                      {item.status === 'done' ? (
                        <CheckCircle2 className="size-4 text-primary" />
                      ) : item.status === 'error' ? (
                        <AlertCircle className="size-4 text-destructive" />
                      ) : (
                        <LoaderCircle
                          className={`size-4 ${item.status === 'uploading' ? 'animate-spin' : ''}`}
                        />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium">
                          {item.file.name}
                        </p>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
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
                        <Progress
                          className="mt-2"
                          value={item.progress}
                          aria-label={`${item.file.name} 上传进度`}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-16 flex flex-wrap items-center justify-between gap-5 border-b border-border pb-5">
          <div>
            <p className="eyebrow">最近上传</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
              我的画廊
            </h2>
          </div>
          <div className="flex items-center gap-2" aria-label="媒体筛选">
            {filters.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  className={`filter-chip ${filter === option.value ? 'is-active' : ''}`}
                  type="button"
                  key={option.value}
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                >
                  {Icon && <Icon />}
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <div className="media-masonry mt-8" aria-label="正在载入画廊">
            {[38, 52, 44, 60, 48, 56].map((height, index) => (
              <div
                className="media-skeleton"
                style={{ height: `${height}vh` }}
                key={`${height}-${index}`}
              />
            ))}
          </div>
        ) : loadError ? (
          <div className="mt-8 grid min-h-64 place-items-center rounded-[2rem] border border-dashed border-destructive/30 bg-card/60 px-6 py-14 text-center">
            <div>
              <AlertCircle className="mx-auto size-7 text-destructive" />
              <h3 className="mt-4 text-lg font-semibold">画廊暂时没有载入</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {loadError}
              </p>
              <Button
                className="mt-5 rounded-full"
                variant="outline"
                onClick={() => {
                  setIsLoading(true);
                  setLoadError('');
                  setReloadKey((key) => key + 1);
                }}
              >
                <RefreshCw data-icon="inline-start" />
                重试
              </Button>
            </div>
          </div>
        ) : visibleMedia.length === 0 ? (
          <div className="mt-8 grid min-h-64 place-items-center rounded-[2rem] border border-dashed border-border bg-card/50 px-6 py-14 text-center">
            <div>
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                <ImageIcon className="size-6" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">
                {media.length ? '这个分类还没有作品' : '这里还没有作品'}
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                上传第一张照片或第一段视频，内容会自动出现在这里。
              </p>
              <Button
                className="mt-5 rounded-full"
                variant="outline"
                onClick={openPicker}
              >
                选择文件
              </Button>
            </div>
          </div>
        ) : (
          <div className="media-masonry mt-8">
            {visibleMedia.map((item) => (
              <article className="media-card group" key={item.id}>
                <div className="relative overflow-hidden rounded-[1.35rem] bg-muted shadow-[0_14px_40px_rgb(18_41_34/9%)] ring-1 ring-black/5">
                  {item.type === 'image' ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`查看图片：${item.name}`}
                    >
                      {/* Dynamic R2 media has no trusted dimensions at build time. */}
                      {/* oxlint-disable-next-line next/no-img-element */}
                      <img
                        className="block h-auto w-full transition duration-500 group-hover:scale-[1.015]"
                        src={item.url}
                        alt={item.name}
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <>
                      {/* User uploads do not include a separate caption-track asset. */}
                      {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
                      <video
                        className="block h-auto w-full bg-black"
                        src={item.url}
                        controls
                        preload="metadata"
                        playsInline
                      >
                        你的浏览器不支持视频播放。
                      </video>
                    </>
                  )}
                  <span
                    className="absolute left-3 top-3 grid size-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md"
                    aria-hidden="true"
                  >
                    {item.type === 'video' ? (
                      <Play className="size-3.5 fill-current" />
                    ) : (
                      <ImageIcon className="size-3.5" />
                    )}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4 px-1 pb-1 pt-3">
                  <div className="min-w-0">
                    <h3
                      className="truncate text-sm font-semibold"
                      title={item.name}
                    >
                      {item.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {formatBytes(item.size)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
