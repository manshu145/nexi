'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error';
}

interface ToastContextValue {
  show: (msg: string, type: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const show = useCallback((text: string, type: 'success' | 'error') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* Toast container — mobile centered, desktop bottom-right */}
      <div className="fixed bottom-4 right-4 sm:right-4 left-4 sm:left-auto z-[9999] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2rem)] sm:max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-toast-in ${
              toast.type === 'success'
                ? 'bg-amber-500 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? '✓ ' : '✗ '}{toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
