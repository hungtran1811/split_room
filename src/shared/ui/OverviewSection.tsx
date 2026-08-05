import type { ReactNode } from "react";

type OverviewSectionProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function OverviewSection({
  title,
  subtitle,
  action,
  children,
  className = "",
}: OverviewSectionProps) {
  return (
    <section className={`card overview-panel ${className}`.trim()}>
      <div className="card__head">
        <div>
          <h2 className="card__title">{title}</h2>
          {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
        </div>
        {action ? <div className="overview-panel__action">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
