type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton-block ${className}`.trim()} aria-hidden="true" />;
}

export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-grid page-skeleton" role="status" aria-label="Đang tải">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="skeleton-block--stat" />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-stack page-skeleton" role="status" aria-label="Đang tải danh sách">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="skeleton-block--row" />
      ))}
    </div>
  );
}

export function PageLoadingSkeleton({
  stats = 4,
  rows = 4,
}: {
  stats?: number;
  rows?: number;
}) {
  return (
    <div className="page-loading" role="status" aria-live="polite" aria-label="Đang tải dữ liệu">
      <div className="page-loading__pulse" aria-hidden="true">
        <span className="page-loading__dot" />
        <span className="page-loading__dot" />
        <span className="page-loading__dot" />
      </div>
      {stats > 0 ? <SkeletonStatGrid count={stats} /> : null}
      {rows > 0 ? <SkeletonList count={rows} /> : null}
    </div>
  );
}
