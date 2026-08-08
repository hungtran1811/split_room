import type { ReactNode } from "react";
import { MemberAvatar } from "./MemberAvatar";

export type MoneyTone = "due" | "receive" | "neutral";

type MoneyRowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  amount: ReactNode;
  tone?: MoneyTone;
  /** Ưu tiên avatar custom theo roster id */
  memberId?: string;
  avatarLabel?: string;
  badge?: ReactNode;
  highlight?: boolean;
  barPercent?: number;
  className?: string;
};

function toneClass(tone: MoneyTone): string {
  if (tone === "due") return "money-due";
  if (tone === "receive") return "money-receive";
  return "money-neutral";
}

export function MoneyRow({
  title,
  subtitle,
  amount,
  tone = "neutral",
  memberId,
  avatarLabel,
  badge,
  highlight = false,
  barPercent,
  className = "",
}: MoneyRowProps) {
  const showAvatar = Boolean(memberId || avatarLabel);
  const bar = typeof barPercent === "number" ? Math.max(0, Math.min(100, barPercent)) : null;

  return (
    <article
      className={`money-row ${highlight ? "money-row--highlight" : ""} ${
        showAvatar ? "" : "money-row--no-avatar"
      } ${className}`.trim()}
    >
      {showAvatar ? (
        <div className="money-row__avatar-wrap" aria-hidden="true">
          <MemberAvatar memberId={memberId} label={avatarLabel} size={36} />
        </div>
      ) : null}
      <div className="money-row__body">
        <div className="money-row__title">
          {title}
          {badge ? <span className="task-badge">{badge}</span> : null}
        </div>
        {subtitle ? <div className="money-row__subtitle">{subtitle}</div> : null}
        {bar !== null ? (
          <div className="money-row__bar" aria-hidden="true">
            <span
              className={`money-row__bar-fill money-row__bar-fill--${tone}`}
              style={{ width: `${bar}%` }}
            />
          </div>
        ) : null}
      </div>
      <div className={`money-row__amount ${toneClass(tone)}`.trim()}>{amount}</div>
    </article>
  );
}
