'use client';

/* oxlint-disable next/no-html-link-for-pages -- Full document navigation avoids Vinext client-router stalls on Cloudflare. */

import {
  ArrowUpFromLine,
  LogIn,
  LogOut,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import type { CurrentUser } from '@/lib/client-types';
import { cn } from '@/lib/utils';

export function SiteHeader({
  backToGallery = false,
}: {
  backToGallery?: boolean;
}) {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(
        (response) => response.json() as Promise<{ user?: CurrentUser | null }>,
      )
      .then((payload) => setUser(payload.user ?? null))
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/88 backdrop-blur-xl">
      <div className="mx-auto flex min-h-20 max-w-[1500px] items-center justify-between gap-4 px-5 py-3 sm:px-8 lg:px-12">
        <a
          className="group flex items-center gap-3"
          href="/"
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

        <nav className="flex items-center gap-2" aria-label="主导航">
          {user?.role === 'admin' && (
            <a
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                'hidden rounded-full sm:inline-flex',
              )}
              href="/admin/users"
            >
              <ShieldCheck data-icon="inline-start" />
              审核
            </a>
          )}
          {user ? (
            <>
              <span className="hidden text-sm text-muted-foreground md:inline">
                {user.displayName}
                {user.status !== 'approved' && (
                  <em className="ml-2 not-italic text-destructive">待审核</em>
                )}
              </span>
              <button
                className={cn(
                  buttonVariants({ variant: 'ghost' }),
                  'rounded-full',
                )}
                type="button"
                onClick={() => void logout()}
              >
                <LogOut data-icon="inline-start" />
                <span className="hidden sm:inline">退出</span>
              </button>
            </>
          ) : (
            <a
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                'rounded-full',
              )}
              href="/login"
            >
              <LogIn data-icon="inline-start" />
              登录
            </a>
          )}
          <a
            className={cn(buttonVariants(), 'h-10 rounded-full px-4 shadow-sm')}
            href={
              backToGallery
                ? '/'
                : user?.status === 'approved'
                  ? '/upload'
                  : '/login'
            }
          >
            <ArrowUpFromLine data-icon="inline-start" />
            {backToGallery ? '返回画廊' : '上传作品'}
          </a>
        </nav>
      </div>
    </header>
  );
}
