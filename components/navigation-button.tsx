import type { ReactNode } from 'react';

export function NavigationButton({
  href,
  className,
  children,
  ariaLabel,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <form action={href} method="get" className="contents">
      <button className={className} type="submit" aria-label={ariaLabel}>
        {children}
      </button>
    </form>
  );
}
