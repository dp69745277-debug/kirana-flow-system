import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber';
import { playClick, playSuccess, playAlert } from '@/lib/sound';

export { AnimatedNumber };

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'amber';

export function Button({ variant = 'primary', className, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-slate-600 hover:bg-slate-100',
    amber: 'bg-amber-500 text-white hover:bg-amber-600',
  };
  return (
    <button
      className={cn('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none min-h-[44px]', styles[variant], className)}
      onClick={(e) => {
        playClick();
        onClick?.(e);
      }}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn('w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500', className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn('w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500', className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn('w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500', className)}
      {...props}
    />
  );
}

export function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-medium text-slate-600">
      {children} {required && <span className="text-red-500">*</span>}
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:shadow-md', className)}>{children}</div>;
}

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'teal';

export function Badge({ tone = 'slate', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  const tones: Record<BadgeTone, string> = {
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-800',
    slate: 'bg-slate-100 text-slate-700',
    teal: 'bg-teal-100 text-teal-800',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 overflow-y-auto animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={cn(
          'w-full sm:max-w-lg max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xl animate-modal-scale-up',
          wide && 'sm:max-w-2xl'
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 shrink-0 bg-white dark:bg-slate-900">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 sm:p-5">{children}</div>
        {footer && (
          <div className="border-t border-slate-200 dark:border-slate-800 px-5 py-3.5 shrink-0 bg-slate-50 dark:bg-slate-800/50">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onClose, danger = true }: {
  open: boolean; title: string; message: string; confirmLabel?: string;
  onConfirm: () => void; onClose: () => void; danger?: boolean;
}) {
  useEffect(() => {
    if (open) {
      playAlert();
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex gap-3">
        <div className={cn('mt-0.5 rounded-full p-2 h-fit', danger ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600')}>
          <AlertTriangle size={18} />
        </div>
        <p className="text-sm text-slate-600">{message}</p>
      </div>
      <div className="mt-5 flex gap-2 justify-end">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={() => { onConfirm(); onClose(); }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function StatCard({ label, value, sub, tone = 'slate', icon, className }: { label: string; value: string | number; sub?: string; tone?: BadgeTone; icon?: ReactNode; className?: string }) {
  const tones: Record<BadgeTone, string> = {
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    slate: 'bg-slate-100 text-slate-600',
    teal: 'bg-teal-50 text-teal-700',
  };
  return (
    <Card className={cn('p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 truncate tabular-nums">
            <AnimatedNumber value={value} />
          </p>
          {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
        </div>
        {icon && <div className={cn('rounded-lg p-2 shrink-0 transition-transform duration-200 hover:scale-105', tones[tone])}>{icon}</div>}
      </div>
    </Card>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
      <Loader2 className="animate-spin" size={24} />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function EmptyState({ icon, title, message, action }: { icon?: ReactNode; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center px-4">
      {icon && <div className="text-slate-300">{icon}</div>}
      <p className="font-medium text-slate-700">{title}</p>
      {message && <p className="text-sm text-slate-400 max-w-sm">{message}</p>}
      {action}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (msg: string, error = false) => {
    setToast({ msg, error });
    if (error) {
      playAlert();
    } else {
      playSuccess();
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3000);
  };
  const node = toast && typeof document !== 'undefined' ? createPortal(
    <div className={cn(
      'fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[110] rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg max-w-[90vw] text-center animate-toast-pop',
      toast.error ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
    )}>
      {toast.msg}
    </div>,
    document.body
  ) : null;
  return { show, node };
}
