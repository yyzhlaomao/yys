'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/config')
      .then(
        (response) =>
          response.json() as Promise<{ turnstileSiteKey?: string | null }>,
      )
      .then((payload) => setSiteKey(payload.turnstileSiteKey ?? null))
      .catch(() => setSiteKey(null));
  }, []);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    const render = () => {
      if (
        cancelled ||
        !containerRef.current ||
        !window.turnstile ||
        widgetRef.current
      )
        return;
      widgetRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'auto',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-yys-turnstile]',
    );
    if (existing) {
      if (window.turnstile) render();
      else existing.addEventListener('load', render, { once: true });
    } else {
      const script = document.createElement('script');
      script.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.yysTurnstile = 'true';
      script.addEventListener('load', render, { once: true });
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile)
        window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [onToken, siteKey]);

  if (!siteKey) return null;
  return (
    <div ref={containerRef} className="min-h-[65px]" aria-label="人机验证" />
  );
}
