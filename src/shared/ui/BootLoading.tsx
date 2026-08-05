import type { ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";

type BootLoadingProps = {
  title?: string;
  subtitle?: string;
  loading?: boolean;
  children?: ReactNode;
};

export function BootLoading({
  title,
  subtitle,
  loading = false,
  children,
}: BootLoadingProps) {
  return (
    <div className="boot-screen">
      <div className="app-boot__card">
        <div className={`app-boot__logo${loading ? " is-loading" : ""}`}>
          <BrandLogo size={88} decorative />
        </div>
        {title ? <h1>{title}</h1> : null}
        {subtitle ? <p>{subtitle}</p> : null}
        {loading ? (
          <div className="app-boot__progress" aria-hidden="true">
            <span className="app-boot__progress-bar" />
          </div>
        ) : null}
        {children ? <div className="app-boot__actions">{children}</div> : null}
      </div>
    </div>
  );
}
