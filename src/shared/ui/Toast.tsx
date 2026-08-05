import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "danger" | "info";

type ToastItem = {
  id: string;
  title: string;
  message: string;
  variant: ToastVariant;
};

type ShowToastInput = {
  title?: string;
  message: string;
  variant?: ToastVariant;
};

type ToastContextValue = {
  showToast: (input: ShowToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 3200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const removeToast = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    ({ title = "Thông báo", message, variant = "success" }: ShowToastInput) => {
      const id = `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      setItems((current) => [...current, { id, title, message, variant }]);
      const timer = setTimeout(() => removeToast(id), TOAST_DURATION_MS);
      timers.current.set(id, timer);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast-item toast-item--${item.variant}`}>
            <div className="toast-item__title">{item.title}</div>
            <div className="toast-item__message">{item.message}</div>
            <button
              type="button"
              className="toast-item__close"
              aria-label="Đóng"
              onClick={() => removeToast(item.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast phải được dùng trong ToastProvider.");
  }
  return context;
}
