'use client';

import {
  Check,
  Clock3,
  LoaderCircle,
  ShieldAlert,
  UserRoundCheck,
  UserRoundX,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { SiteHeader } from '@/components/site-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CurrentUser, UserStatus } from '@/lib/client-types';

const statusCopy: Record<UserStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  suspended: '已停用',
};

export function AdminUsers() {
  const [users, setUsers] = useState<CurrentUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState('');

  useEffect(() => {
    fetch('/api/admin/users', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as {
          users?: CurrentUser[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error ?? '无法读取申请列表。');
        return payload.users ?? [];
      })
      .then(setUsers)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : '无法读取申请列表。',
        ),
      )
      .finally(() => setIsLoading(false));
  }, []);

  async function updateStatus(id: string, status: UserStatus) {
    setUpdating(id);
    setError('');
    try {
      const response = await fetch(`/api/admin/users/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? '更新失败。');
      setUsers((current) =>
        current.map((user) => (user.id === id ? { ...user, status } : user)),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新失败。');
    } finally {
      setUpdating('');
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader backToGallery />
      <section className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8 lg:px-12">
        <p className="eyebrow">管理员控制台</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
              账号审核
            </h1>
            <p className="mt-3 text-muted-foreground">
              只有通过审核的账号才能创建收藏夹和上传作品。
            </p>
          </div>
          <div className="rounded-full bg-secondary px-4 py-2 text-sm">
            <strong>
              {users.filter((user) => user.status === 'pending').length}
            </strong>{' '}
            个待审核申请
          </div>
        </div>
        {error && (
          <p className="mt-7 rounded-xl bg-destructive/8 p-4 text-sm text-destructive">
            {error}
          </p>
        )}
        {isLoading ? (
          <div className="grid min-h-64 place-items-center">
            <LoaderCircle className="size-7 animate-spin text-primary" />
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {users.map((user) => (
              <article
                className="rounded-[1.5rem] border border-border bg-card p-5 shadow-sm"
                key={user.id}
              >
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                      {user.role === 'admin' ? (
                        <ShieldAlert />
                      ) : (
                        <UserRoundCheck />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{user.displayName}</h2>
                        <Badge
                          variant={
                            user.status === 'approved'
                              ? 'default'
                              : user.status === 'pending'
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {statusCopy[user.status]}
                        </Badge>
                        {user.role === 'admin' && (
                          <Badge variant="outline">管理员</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        @{user.username}
                        {user.email ? ` · ${user.email}` : ''}
                      </p>
                      {user.applicationNote && (
                        <p className="mt-2 max-w-2xl text-sm leading-6">
                          {user.applicationNote}
                        </p>
                      )}
                      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock3 className="size-3" />
                        申请于{' '}
                        {new Date(user.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </div>
                  {user.role !== 'admin' && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {user.status !== 'approved' && (
                        <Button
                          className="rounded-full"
                          disabled={updating === user.id}
                          onClick={() => void updateStatus(user.id, 'approved')}
                        >
                          <Check />
                          通过
                        </Button>
                      )}
                      {user.status !== 'rejected' && (
                        <Button
                          className="rounded-full"
                          variant="outline"
                          disabled={updating === user.id}
                          onClick={() => void updateStatus(user.id, 'rejected')}
                        >
                          <UserRoundX />
                          拒绝
                        </Button>
                      )}
                      {user.status === 'approved' && (
                        <Button
                          className="rounded-full"
                          variant="destructive"
                          disabled={updating === user.id}
                          onClick={() =>
                            void updateStatus(user.id, 'suspended')
                          }
                        >
                          <ShieldAlert />
                          停用
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
