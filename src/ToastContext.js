import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import "./Toast.css";

const ToastContext = createContext(null);

const ICONS = {
  success: "✓",
  error: "!",
  warning: "!",
  info: "i",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, type = "info", duration = 4200) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  const notify = useMemo(
    () => ({
      success: (message, duration) => push(message, "success", duration),
      error: (message, duration) => push(message, "error", duration ?? 5600),
      warning: (message, duration) => push(message, "warning", duration),
      info: (message, duration) => push(message, "info", duration),
    }),
    [push]
  );

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setConfirmState({
        message,
        title: options.title || "Please confirm",
        confirmLabel: options.confirmLabel || "Confirm",
        cancelLabel: options.cancelLabel || "Cancel",
        danger: Boolean(options.danger),
        resolve,
      });
    });
  }, []);

  const closeConfirm = (result) => {
    if (!confirmState) return;
    confirmState.resolve(result);
    setConfirmState(null);
  };

  const value = useMemo(
    () => ({
      ...notify,
      confirm,
    }),
    [notify, confirm]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`} role="status">
            <span className="toast__icon" aria-hidden>
              {ICONS[t.type] || "i"}
            </span>
            <div className="toast__body">
              <p className="toast__message">{t.message}</p>
            </div>
            <button
              type="button"
              className="toast__close"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="confirm-overlay" role="presentation">
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title" className="confirm-dialog__title">
              {confirmState.title}
            </h2>
            <p className="confirm-dialog__message">{confirmState.message}</p>
            <div className="confirm-dialog__actions">
              <button
                type="button"
                className="confirm-dialog__btn confirm-dialog__btn--cancel"
                onClick={() => closeConfirm(false)}
              >
                {confirmState.cancelLabel}
              </button>
              <button
                type="button"
                className={`confirm-dialog__btn ${
                  confirmState.danger
                    ? "confirm-dialog__btn--danger"
                    : "confirm-dialog__btn--ok"
                }`}
                onClick={() => closeConfirm(true)}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
