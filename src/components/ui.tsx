import { useEffect, type ReactNode } from 'react';

/** 介面基礎元件。刻意保持極少量，避免為了一顆按鈕拖進整套元件庫。 */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'soft';
  size?: 'sm' | 'md' | 'lg';
};

const VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700 active:bg-slate-800',
  soft: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200',
  outline: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-500',
};

const SIZE: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-2.5 text-sm rounded-lg gap-1.5',
  md: 'h-10 px-3.5 rounded-xl gap-2',
  lg: 'h-12 px-5 rounded-xl gap-2 text-lg',
};

export function Button({ variant = 'outline', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center font-medium transition-colors select-none',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    />
  );
}

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}
    />
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1 flex items-baseline gap-2">
      <span className="text-sm font-medium text-slate-700">{children}</span>
      {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
    </div>
  );
}

export function TextInput({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cx(
        'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900',
        'placeholder:text-slate-300 focus:border-blue-500 focus:outline-none',
        className,
      )}
    />
  );
}

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={cx(
        'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900',
        'placeholder:text-slate-300 focus:border-blue-500 focus:outline-none',
        className,
      )}
    />
  );
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cx(
        'rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900',
        'focus:border-blue-500 focus:outline-none',
        className,
      )}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6">
      <div
        className={cx(
          'fgs-scroll max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="關閉">
            ✕
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Badge({
  children,
  color = '#64748b',
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, white)` }}
    >
      {children}
    </span>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span className="inline-block size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      {label}
    </div>
  );
}
