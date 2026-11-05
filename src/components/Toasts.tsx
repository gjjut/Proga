import { useApp } from '../state';
import { CheckIcon, CloseIcon, InfoIcon } from './Icons';

export function Toasts() {
  const { toasts, dismissToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.tone}${toast.leaving ? ' is-leaving' : ''}`}
        >
          <span className="toast__icon">
            {toast.tone === 'success' ? (
              <CheckIcon size={18} />
            ) : toast.tone === 'error' ? (
              <CloseIcon size={18} />
            ) : (
              <InfoIcon size={18} />
            )}
          </span>
          <span className="toast__text">{toast.message}</span>
          <button
            type="button"
            className="toast__close"
            onClick={() => dismissToast(toast.id)}
            aria-label="Скрыть уведомление"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
