import { formatCompactVND, formatVND } from "../../config/i18n";

type ResponsiveMoneyProps = {
  amount: number | null | undefined;
  className?: string;
  showPositiveSign?: boolean;
};

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

export function ResponsiveMoney({
  amount,
  className,
  showPositiveSign = false,
}: ResponsiveMoneyProps) {
  const roundedAmount = Math.round(Number(amount));
  const normalizedAmount = Number.isFinite(roundedAmount) ? roundedAmount : 0;
  const positiveSign = showPositiveSign && normalizedAmount > 0 ? "+" : "";
  const fullValue = `${positiveSign}${formatVND(normalizedAmount)}`;
  const compactValue = formatCompactVND(normalizedAmount, { showPositiveSign });

  return (
    <span className={joinClassNames("responsive-money", className)} title={fullValue}>
      <span className="responsive-money__full" aria-hidden="true">
        {fullValue}
      </span>
      <span className="responsive-money__compact" aria-hidden="true">
        {compactValue}
      </span>
      <span className="sr-only">{fullValue}</span>
    </span>
  );
}
