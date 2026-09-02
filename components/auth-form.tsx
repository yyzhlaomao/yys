'use client';

/* oxlint-disable next/no-html-link-for-pages -- Full document navigation is more reliable for Vinext multi-route auth flows. */

import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TurnstileWidget } from '@/components/turnstile-widget';

type Mode = 'login' | 'register' | 'setup';

const copy = {
  login: {
    eyebrow: '欢迎回来',
    title: '登录光影集',
    description: '登录后，已通过审核的账号可以进入独立上传工作区。',
    submit: '登录',
  },
  register: {
    eyebrow: '申请上传权限',
    title: '创建账号申请',
    description: '提交后由管理员审核。审核前仍然可以浏览公开画廊。',
    submit: '提交申请',
  },
  setup: {
    eyebrow: '首次初始化',
    title: '创建管理员',
    description: '这个入口只在尚无管理员时有效。完成后请删除初始化令牌。',
    submit: '创建管理员',
  },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [setupAvailable, setSetupAvailable] = useState(true);
  const handleTurnstile = useCallback(
    (token: string) => setTurnstileToken(token),
    [],
  );

  useEffect(() => {
    if (mode !== 'setup') return;
    fetch('/api/auth/setup')
      .then(
        (response) => response.json() as Promise<{ setupAvailable?: boolean }>,
      )
      .then((payload) => setSetupAvailable(payload.setupAvailable === true))
      .catch(() => setSetupAvailable(false));
  }, [mode]);

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const endpoint =
        mode === 'login'
          ? '/api/auth/login'
          : mode === 'register'
            ? '/api/auth/register'
            : '/api/auth/setup';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          displayName,
          email,
          password,
          applicationNote: note,
          setupToken,
          turnstileToken,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        user?: { status: string };
      };
      if (!response.ok) throw new Error(payload.error ?? '操作没有完成。');
      if (mode === 'register') {
        setSuccess(payload.message ?? '申请已提交。');
        setPassword('');
      } else {
        const returnTo = new URLSearchParams(window.location.search).get(
          'returnTo',
        );
        window.location.href = returnTo?.startsWith('/')
          ? returnTo
          : mode === 'setup'
            ? '/admin/users'
            : '/upload';
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作没有完成。');
    } finally {
      setIsSubmitting(false);
    }
  }

  const content = copy[mode];
  if (mode === 'setup' && !setupAvailable) {
    return (
      <AuthShell>
        <CheckCircle2 className="size-9 text-primary" />
        <h1 className="mt-5 text-3xl font-semibold">管理员已创建</h1>
        <p className="mt-3 text-muted-foreground">
          初始化入口已经关闭，请使用管理员账号登录。
        </p>
        <a
          className="mt-7 inline-flex text-sm font-semibold text-primary hover:underline"
          href="/login"
        >
          前往登录
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <p className="eyebrow">{content.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">
        {content.title}
      </h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        {content.description}
      </p>
      {success ? (
        <div className="mt-8 rounded-2xl border border-primary/25 bg-primary/5 p-5">
          <CheckCircle2 className="size-6 text-primary" />
          <p className="mt-3 font-semibold">{success}</p>
          <a
            className="mt-4 inline-block text-sm text-primary hover:underline"
            href="/login"
          >
            返回登录
          </a>
        </div>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={(event) => void submit(event)}
        >
          {mode === 'setup' && (
            <Field label="初始化令牌" id="setup-token">
              <Input
                id="setup-token"
                className="h-11"
                type="password"
                value={setupToken}
                onChange={(event) => setSetupToken(event.target.value)}
                required
              />
            </Field>
          )}
          <Field label="用户名" id="username">
            <Input
              id="username"
              className="h-11"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={32}
              required
            />
          </Field>
          {mode !== 'login' && (
            <Field label="显示名称" id="display-name">
              <Input
                id="display-name"
                className="h-11"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={48}
                required
              />
            </Field>
          )}
          {mode === 'register' && (
            <Field label="联系邮箱（可选）" id="email">
              <Input
                id="email"
                className="h-11"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          )}
          <Field label="密码" id="password">
            <Input
              id="password"
              className="h-11"
              type="password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={10}
              maxLength={128}
              required
            />
          </Field>
          {mode === 'register' && (
            <Field label="申请说明（可选）" id="note">
              <Textarea
                id="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                placeholder="简单说明你希望上传的内容"
              />
            </Field>
          )}
          {mode !== 'setup' && <TurnstileWidget onToken={handleTurnstile} />}
          {error && (
            <p className="rounded-xl bg-destructive/8 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            className="h-11 w-full rounded-xl"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <LoaderCircle className="animate-spin" />
            ) : mode === 'login' ? (
              <LockKeyhole />
            ) : (
              <UserRound />
            )}
            {content.submit}
          </Button>
        </form>
      )}
      <div className="mt-7 flex items-center justify-between gap-4 border-t border-border pt-5 text-sm">
        <a
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          href="/"
        >
          <ArrowLeft className="size-4" />
          返回画廊
        </a>
        {mode === 'login' ? (
          <a
            className="font-semibold text-primary hover:underline"
            href="/register"
          >
            申请账号
          </a>
        ) : mode === 'register' ? (
          <a
            className="font-semibold text-primary hover:underline"
            href="/login"
          >
            已有账号
          </a>
        ) : null}
      </div>
    </AuthShell>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-surface min-h-screen px-5 py-10 sm:grid sm:place-items-center">
      <section className="mx-auto w-full max-w-md rounded-[2rem] border border-border bg-card/94 p-6 shadow-[0_30px_100px_rgb(20_35_31/12%)] backdrop-blur sm:p-9">
        {children}
      </section>
    </main>
  );
}
