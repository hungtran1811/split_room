import { useEffect, type ReactNode } from "react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("app-sheet-open");

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("app-sheet-open");
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="bottom-sheet is-open">
      <button
        type="button"
        className="bottom-sheet__backdrop"
        aria-label="Đóng"
        onClick={onClose}
      />
      <div className="bottom-sheet__panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="bottom-sheet__handle" aria-hidden="true" />
        <div className="bottom-sheet__header">
          <h2 className="bottom-sheet__title">{title}</h2>
          <button type="button" className="bottom-sheet__close" aria-label="Đóng" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="bottom-sheet__body">{children}</div>
      </div>
    </div>
  );
}
