/**
 * Loading placeholders with the shape of what is coming (`.skeleton` in index.css: well tone + soft shimmer).
 * `PageSkeleton` draws a whole screen; `PageState` uses it, shown only after 150 ms so quick loads do not flicker.
 */
import type { ReactNode } from 'react';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/** One block. Give it a size with className (h-4 w-1/2, h-40…). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('skeleton', className)} />;
}

/** One line of text. */
export function SkeletonLine({ width = '100%', className }: { width?: string; className?: string }) {
  return <div aria-hidden="true" className={cx('skeleton h-3', className)} style={{ width }} />;
}

/** A few lines of text, the last one shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cx('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-3" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 32 }: { size?: number }) {
  return <div aria-hidden="true" className="skeleton shrink-0" style={{ width: size, height: size }} />;
}

/** A card: eyebrow, title, a few lines. */
export function SkeletonCard({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div aria-hidden="true" className={cx('rounded-[6px] border border-line bg-white p-5', className)}>
      {children ?? (
        <>
          <Skeleton className="mb-3 h-2.5 w-24" />
          <Skeleton className="mb-4 h-5 w-3/4" />
          <SkeletonText lines={3} />
        </>
      )}
    </div>
  );
}

/** A table: header and rows of cells. */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-[6px] border border-line bg-white">
      <div className="flex gap-4 border-b border-line bg-paper px-5 py-3">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <SkeletonRow key={r} cols={cols} />
      ))}
    </div>
  );
}

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-b-0">
      {Array.from({ length: cols }, (_, c) => (
        <Skeleton key={c} className={cx('h-3', c === 0 ? 'flex-[2]' : 'flex-1')} />
      ))}
    </div>
  );
}

/** A page heading: eyebrow, title, subtitle, actions. */
function SkeletonHeader({ dark = false }: { dark?: boolean }) {
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-4 rounded-[6px] p-6', dark ? 'bg-dark-surface' : 'border border-line bg-white')}>
      <div className="w-full max-w-xl space-y-3">
        <Skeleton className="h-2.5 w-40" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-3 w-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-36" />
      </div>
    </div>
  );
}

function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i}>
          <Skeleton className="mb-3 h-2.5 w-20" />
          <Skeleton className="h-7 w-16" />
        </SkeletonCard>
      ))}
    </div>
  );
}

export type PageSkeletonKind = 'page' | 'cards' | 'list' | 'table' | 'console' | 'detail' | 'sections' | 'profile';

/** A whole screen (or one block of it, for 'cards', 'list' and 'table') while it loads. */
export function PageSkeleton({ kind = 'page', label = 'Loading' }: { kind?: PageSkeletonKind; label?: string }) {
  let body: ReactNode;
  switch (kind) {
    case 'cards':
      body = (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i}>
              <Skeleton className="mb-4 h-28 w-full" />
              <Skeleton className="mb-2 h-2.5 w-24" />
              <Skeleton className="mb-3 h-5 w-3/4" />
              <SkeletonText lines={2} />
            </SkeletonCard>
          ))}
        </div>
      );
      break;
    case 'list':
      body = (
        <div className="divide-y divide-line rounded-[6px] border border-line bg-white">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <SkeletonAvatar size={36} />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
      );
      break;
    case 'table':
      body = <SkeletonTable />;
      break;
    case 'console':
      body = (
        <div className="space-y-6">
          <SkeletonHeader dark />
          <SkeletonKpis />
          <SkeletonTable rows={7} cols={6} />
        </div>
      );
      break;
    case 'detail':
      body = (
        <div className="space-y-6">
          <SkeletonHeader dark />
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <SkeletonCard>
                <Skeleton className="mb-4 h-2.5 w-28" />
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="mb-4 space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-3 w-10" />
                    </div>
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </SkeletonCard>
              <SkeletonCard />
            </div>
            <div className="space-y-6 lg:col-span-4">
              <SkeletonCard>
                <Skeleton className="mb-4 h-2.5 w-24" />
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="mb-3 flex gap-3">
                    <Skeleton className="h-2.5 w-2.5 rounded-full" />
                    <Skeleton className="h-3 flex-1" />
                  </div>
                ))}
              </SkeletonCard>
            </div>
          </div>
        </div>
      );
      break;
    case 'sections':
      body = (
        <div className="space-y-6">
          <SkeletonHeader dark />
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonCard key={i}>
              <div className="mb-5 flex items-center gap-3">
                <SkeletonAvatar size={36} />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-2.5 w-72 max-w-full" />
                </div>
              </div>
              <SkeletonTable rows={3} cols={4} />
            </SkeletonCard>
          ))}
        </div>
      );
      break;
    case 'profile':
      body = (
        <div className="mx-auto max-w-[980px] space-y-6">
          <SkeletonCard>
            <div className="flex items-center gap-4">
              <SkeletonAvatar size={64} />
              <div className="flex-1 space-y-2.5">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          </SkeletonCard>
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      );
      break;
    default:
      body = (
        <div className="space-y-6">
          <SkeletonHeader />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard className="hidden xl:block" />
          </div>
          <SkeletonTable rows={4} />
        </div>
      );
  }
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only" role="status">
        {label}
      </span>
      {body}
    </div>
  );
}
