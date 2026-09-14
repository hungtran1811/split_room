import type { ReactNode } from "react";
import { formatVND } from "../../shared/lib/format";
import { formatViDateShort } from "../../shared/lib/date";
import { RowAction } from "../../shared/ui/PageHeader";

export type ExpenseDebtChip = {
  id: string;
  label: string;
  amount: number;
};

type ExpenseRowProps = {
  note: string;
  payerLabel: string;
  creatorLabel?: string;
  amount: number;
  debts: ExpenseDebtChip[];
  onEdit?: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
};

const MAX_DEBT_CHIPS = 3;

export function ExpenseRow({
  note,
  payerLabel,
  creatorLabel,
  amount,
  debts,
  onEdit,
  onDelete,
  canEdit = false,
  canDelete = false,
}: ExpenseRowProps) {
  const visibleDebts = debts.slice(0, MAX_DEBT_CHIPS);
  const extra = debts.length - visibleDebts.length;
  const metaParts = [`${payerLabel} trả`, creatorLabel ? creatorLabel : ""].filter(Boolean);
  const showActions = (canEdit && onEdit) || (canDelete && onDelete);

  return (
    <article className="expense-row">
      <div className="expense-row__content">
        <div className="expense-row__note">{note || "Không có ghi chú"}</div>
        <div className="expense-row__meta">{metaParts.join(" · ")}</div>
        {debts.length > 0 ? (
          <div className="expense-row__debts">
            {visibleDebts.map((debt) => (
              <span
                key={debt.id}
                className="expense-row__chip"
                title={`${debt.label} ${formatVND(debt.amount)}`}
              >
                <span className="expense-row__chip-name">{debt.label}</span>
                <span className="expense-row__chip-amount">{formatVND(debt.amount)}</span>
              </span>
            ))}
            {extra > 0 ? (
              <span className="expense-row__chip expense-row__chip--more">+{extra}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="expense-row__side">
        <div className="expense-row__amount">{formatVND(amount)}</div>
        {showActions ? (
          <div className="expense-row__actions">
            {canEdit && onEdit ? <RowAction label="Sửa" onClick={onEdit} /> : null}
            {canDelete && onDelete ? (
              <RowAction label="Xóa" variant="danger" onClick={onDelete} />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

type ExpenseDaySectionProps = {
  date: string;
  itemCount: number;
  dayTotal: number;
  children: ReactNode;
};

export function ExpenseDaySection({
  date,
  itemCount,
  dayTotal,
  children,
}: ExpenseDaySectionProps) {
  return (
    <section className="expense-day">
      <div className="expense-day__header">
        <div className="expense-day__date">{formatViDateShort(date)}</div>
        <div className="expense-day__stats">
          <span>{itemCount} khoản</span>
          <span className="expense-day__total">{formatVND(dayTotal)}</span>
        </div>
      </div>
      <div className="expense-day__list">{children}</div>
    </section>
  );
}
