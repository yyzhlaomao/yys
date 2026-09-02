'use client';

import {
  AlertCircle,
  CalendarDays,
  FolderHeart,
  ImageIcon,
  LayoutGrid,
  Play,
  RefreshCw,
  Shapes,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import type { CollectionItem, MediaItem } from '@/lib/client-types';

type ViewMode = 'all' | 'collection' | 'date' | 'type';
type GalleryGroup = {
  key: string;
  title: string;
  description?: string;
  items: MediaItem[];
};

const views = [
  { value: 'collection' as const, label: '收藏夹', icon: FolderHeart },
  { value: 'date' as const, label: '日期', icon: CalendarDays },
  { value: 'type' as const, label: '图片与视频', icon: Shapes },
  { value: 'all' as const, label: '全部', icon: LayoutGrid },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function monthKey(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(timestamp));
}

function MediaCard({ item }: { item: MediaItem }) {
  return (
    <article className="media-card group">
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
          <h3 className="truncate text-sm font-semibold" title={item.name}>
            {item.name}
          </h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {item.collectionName ?? '未分类'} · {formatDate(item.createdAt)}
          </p>
        </div>
        <span className="shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {formatBytes(item.size)}
        </span>
      </div>
    </article>
  );
}

function MediaSection({
  title,
  description,
  items,
}: {
  title: string;
  description?: string;
  items: MediaItem[];
}) {
  if (!items.length) return null;
  return (
    <section className="mt-12 first:mt-8">
      <div className="mb-5 flex items-end justify-between gap-5 border-b border-border pb-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <span className="text-xs font-semibold text-muted-foreground">
          {items.length} 件作品
        </span>
      </div>
      <div className="media-masonry">
        {items.map((item) => (
          <MediaCard item={item} key={item.id} />
        ))}
      </div>
    </section>
  );
}

export function MediaGallery() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [view, setView] = useState<ViewMode>('collection');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/media', { cache: 'no-store' }).then((response) =>
        (
          response.json() as Promise<{ media?: MediaItem[]; error?: string }>
        ).then((data) => ({ response, data })),
      ),
      fetch('/api/collections', { cache: 'no-store' }).then((response) =>
        (
          response.json() as Promise<{
            collections?: CollectionItem[];
            error?: string;
          }>
        ).then((data) => ({ response, data })),
      ),
    ])
      .then(([mediaResult, collectionResult]) => {
        if (!mediaResult.response.ok)
          throw new Error(mediaResult.data.error ?? '读取画廊失败。');
        if (!collectionResult.response.ok)
          throw new Error(collectionResult.data.error ?? '读取收藏夹失败。');
        if (active) {
          setMedia(mediaResult.data.media ?? []);
          setCollections(collectionResult.data.collections ?? []);
          setError('');
        }
      })
      .catch(
        (reason: unknown) =>
          active &&
          setError(reason instanceof Error ? reason.message : '读取画廊失败。'),
      )
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const groups = useMemo<GalleryGroup[]>(() => {
    if (view === 'type') {
      return [
        {
          key: 'image',
          title: '图片',
          description: '静止的片刻',
          items: media.filter((item) => item.type === 'image'),
        },
        {
          key: 'video',
          title: '视频',
          description: '流动的记忆',
          items: media.filter((item) => item.type === 'video'),
        },
      ];
    }
    if (view === 'date') {
      const map = new Map<string, MediaItem[]>();
      for (const item of media) {
        const key = monthKey(item.createdAt);
        map.set(key, [...(map.get(key) ?? []), item]);
      }
      return Array.from(map, ([key, items]) => ({ key, title: key, items }));
    }
    if (view === 'collection') {
      const sections = collections.map((collection) => ({
        key: collection.id,
        title: collection.name,
        description:
          collection.description ?? `由 ${collection.ownerName} 创建`,
        items: media.filter((item) => item.collectionId === collection.id),
      }));
      const uncategorized = media.filter((item) => !item.collectionId);
      if (uncategorized.length)
        sections.push({
          key: 'uncategorized',
          title: '未分类',
          description: '升级前上传的作品',
          items: uncategorized,
        });
      return sections;
    }
    return [{ key: 'all', title: '全部作品', items: media }];
  }, [collections, media, view]);

  const imageCount = media.filter((item) => item.type === 'image').length;
  const videoCount = media.length - imageCount;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <section className="mx-auto max-w-[1500px] px-5 pb-16 pt-10 sm:px-8 sm:pt-14 lg:px-12">
        <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="eyebrow">公开影像空间</p>
            <h1 className="mt-4 max-w-4xl text-balance text-[clamp(2.8rem,7vw,6.8rem)] font-semibold leading-[0.9] tracking-[-0.07em]">
              每一帧，<span className="text-primary">都有位置。</span>
            </h1>
            <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
              从收藏夹、时间或媒体类型重新发现照片与视频。上传工作区已经独立，让画廊只留下内容本身。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-[1.5rem] border border-border bg-card p-4 shadow-sm">
            {[
              ['作品', media.length],
              ['图片', imageCount],
              ['视频', videoCount],
            ].map(([label, count]) => (
              <div className="min-w-20 text-center" key={label}>
                <strong className="block text-2xl tracking-tight">
                  {count}
                </strong>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-5 border-b border-border pb-5">
          <div>
            <p className="eyebrow">浏览方式</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
              探索画廊
            </h2>
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label="画廊分类方式"
          >
            {views.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  className={`filter-chip ${view === option.value ? 'is-active' : ''}`}
                  type="button"
                  key={option.value}
                  aria-pressed={view === option.value}
                  onClick={() => setView(option.value)}
                >
                  <Icon />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {view === 'collection' && collections.length > 0 && (
          <div className="collection-strip mt-8">
            {collections.map((collection) => (
              <button
                className="collection-cover-card"
                type="button"
                key={collection.id}
                onClick={() =>
                  document
                    .getElementById(`section-${collection.id}`)
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                {collection.coverUrl ? (
                  // oxlint-disable-next-line next/no-img-element
                  <img src={collection.coverUrl} alt="" />
                ) : (
                  <FolderHeart />
                )}
                <span>
                  <strong>{collection.name}</strong>
                  <small>{collection.mediaCount} 件作品</small>
                </span>
              </button>
            ))}
          </div>
        )}

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
        ) : error ? (
          <div className="mt-8 grid min-h-64 place-items-center rounded-[2rem] border border-dashed border-destructive/30 bg-card/60 px-6 py-14 text-center">
            <div>
              <AlertCircle className="mx-auto size-7 text-destructive" />
              <h3 className="mt-4 text-lg font-semibold">画廊暂时没有载入</h3>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <Button
                className="mt-5 rounded-full"
                variant="outline"
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                <RefreshCw data-icon="inline-start" />
                重试
              </Button>
            </div>
          </div>
        ) : media.length === 0 ? (
          <div className="mt-8 grid min-h-64 place-items-center rounded-[2rem] border border-dashed border-border bg-card/50 px-6 py-14 text-center">
            <div>
              <ImageIcon className="mx-auto size-7 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">这里还没有作品</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                登录并创建收藏夹，上传第一张照片或第一段视频。
              </p>
            </div>
          </div>
        ) : (
          groups.map((group) => (
            <div
              id={`section-${group.key}`}
              className="scroll-mt-28"
              key={group.key}
            >
              <MediaSection
                title={group.title}
                description={group.description}
                items={group.items}
              />
            </div>
          ))
        )}
      </section>
    </main>
  );
}
