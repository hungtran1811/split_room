import { useEffect, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./Button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  confirmVariant = "primary",
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onCancel();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("app-modal-open");

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("app-modal-open");
    };
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    <div className="confirm-dialog is-open">
      <button
        type="button"
        className="confirm-dialog__backdrop"
        aria-label="Đóng"
        disabled={pending}
        onClick={() => {
          if (!pending) onCancel();
        }}
      />
      <div
        className="confirm-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog__title">
          {title}
        </h2>
        {description ? <div className="confirm-dialog__body">{description}</div> : null}
        <div className="confirm-dialog__actions">
          <Button variant="ghost" disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} disabled={pending} onClick={onConfirm}>
            {pending ? "Đang xử lý…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
