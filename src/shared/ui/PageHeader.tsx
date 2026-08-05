import type { ReactNode } from "react";
import { Button, type ButtonVariant } from "./Button";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-header__title">{title}</h1>
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  );
}

type LockBannerProps = {
  children: ReactNode;
  variant?: "warning" | "info";
};

export function LockBanner({ children, variant = "warning" }: LockBannerProps) {
  return (
    <div className={`lock-banner ${variant === "info" ? "lock-banner--info" : ""}`.trim()}>
      {children}
    </div>
  );
}

type ListRowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  amount?: ReactNode;
  actions?: ReactNode;
  className?: string;
  alignStart?: boolean;
};

export function ListRow({
  title,
  subtitle,
  amount,
  actions,
  className = "",
  alignStart = false,
}: ListRowProps) {
  return (
    <div
      className={`list-row ${className}`.trim()}
      style={alignStart ? { alignItems: "flex-start" } : undefined}
    >
      <div className="list-row__body">
        <div className="list-row__title">{title}</div>
        {subtitle ? <div className="list-row__subtitle">{subtitle}</div> : null}
      </div>
      {amount !== undefined && amount !== null ? (
        <div className="list-row__amount">{amount}</div>
      ) : null}
      {actions ? <div className="list-row__actions">{actions}</div> : null}
    </div>
  );
}

type ActionButtonProps = {
  label: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
};

export function RowAction({
  label,
  onClick,
  variant = "ghost",
  disabled,
}: ActionButtonProps) {
  return (
    <Button variant={variant} className="btn--sm" onClick={onClick} disabled={disabled}>
      {label}
    </Button>
  );
}
