type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton-block ${className}`.trim()} />;
}

export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-grid">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="skeleton-block--stat" />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-stack">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="skeleton-block--row" />
      ))}
    </div>
  );
}
