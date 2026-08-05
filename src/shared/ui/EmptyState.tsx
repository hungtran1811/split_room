import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__title">{title}</div>
      {description ? <div className="empty-state__text">{description}</div> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
