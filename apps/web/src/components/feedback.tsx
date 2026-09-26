import clsx from 'clsx';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button, Modal } from './ui';

type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackApi {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setDialog(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              'pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border-2 border-b-4 bg-white px-4 py-3 font-bold shadow-lg',
              t.tone === 'success' && 'border-feather text-feather-dark',
              t.tone === 'error' && 'border-cardinal text-cardinal-dark',
              t.tone === 'info' && 'border-macaw text-macaw-dark',
            )}
          >
            {t.tone === 'success' && <CircleCheck className="size-5 shrink-0" />}
            {t.tone === 'error' && <CircleAlert className="size-5 shrink-0" />}
            {t.tone === 'info' && <Info className="size-5 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
      <Modal open={dialog !== null} onClose={() => close(false)} title={dialog?.title ?? ''}>
        <div className="text-wolf">{dialog?.message}</div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="plain" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant={dialog?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {dialog?.confirmLabel ?? 'Aceptar'}
          </Button>
        </div>
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback fuera de FeedbackProvider');
  return ctx;
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Algo salió mal';
}
