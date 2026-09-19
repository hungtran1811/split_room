import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "default" | "wide";
};

const sheetStack: string[] = [];
const SHEET_Z_BASE = 1100;
const SHEET_Z_STEP = 20;

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = "default",
}: BottomSheetProps) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const [zIndex, setZIndex] = useState(SHEET_Z_BASE);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return;

    const id = titleId;
    sheetStack.push(id);
    setZIndex(SHEET_Z_BASE + (sheetStack.length - 1) * SHEET_Z_STEP);
    document.body.classList.add("app-sheet-open");

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (sheetStack[sheetStack.length - 1] !== id) return;
      event.preventDefault();
      onCloseRef.current();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = sheetStack.indexOf(id);
      if (index >= 0) sheetStack.splice(index, 1);
      if (!sheetStack.length) document.body.classList.remove("app-sheet-open");
    };
  }, [open, titleId]);

  if (!open) return null;

  return createPortal(
    <div
      className={`bottom-sheet is-open${size === "wide" ? " bottom-sheet--wide" : ""}`}
      style={{ zIndex }}
    >
      <button
        type="button"
        className="bottom-sheet__backdrop"
        aria-label="Đóng"
        onClick={() => onCloseRef.current()}
      />
      <div className="bottom-sheet__panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="bottom-sheet__handle" aria-hidden="true" />
        <div className="bottom-sheet__header">
          <h2 className="bottom-sheet__title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="bottom-sheet__close" aria-label="Đóng" onClick={() => onCloseRef.current()}>
            ×
          </button>
        </div>
        <div className="bottom-sheet__body">{children}</div>
        {footer ? <div className="bottom-sheet__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
