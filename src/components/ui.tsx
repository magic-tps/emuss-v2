import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { AlertCircle, CalendarDays, LoaderCircle, X } from 'lucide-react';
import { friendlyError } from '../utils/errors';

export function Button({ variant = 'primary', loading, children, disabled, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }) {
  return <button className={`button button-${variant} ${className}`} disabled={disabled || loading} {...props}>{loading && <LoaderCircle className="spin" size={17} aria-hidden="true" />}{children}</button>;
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`input ${props.className || ''}`} />; }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={`input ${props.className || ''}`} />; }
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}{error && <span className="field-error" role="alert">{error}</span>}</label>;
}
export function Loading({ label = 'Cargando información…' }: { label?: string }) { return <div className="loading-state" role="status"><LoaderCircle size={24} className="spin" /><span>{label}</span><div className="skeleton" /><div className="skeleton short" /></div>; }
export function EmptyState({ title = 'Todavía no hay información', description, children }: { title?: string; description?: string; children?: ReactNode }) { return <div className="empty-state"><CalendarDays size={32} aria-hidden="true" /><h3>{title}</h3>{description && <p>{description}</p>}{children}</div>; }
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) { return <div className="error-state" role="alert"><AlertCircle size={20} aria-hidden="true" /><div><strong>No pudimos completar la solicitud</strong><p>{friendlyError(error)}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>Volver a intentar</Button>}</div></div>; }
export const statusLabels: Record<string, string> = { AVAILABLE: 'Disponible', HELD: 'En proceso', RESERVED: 'Reservado', CONFIRMED: 'Confirmada', CHECKED_IN: 'Check-in realizado', COMPLETED: 'Completada', CANCELLED: 'Cancelada', NO_SHOW: 'No asistió', MAINTENANCE: 'Mantenimiento' };
export function StatusBadge({ status }: { status: string }) { return <span className={`badge status-${status.toLowerCase()}`}>{statusLabels[status] || status}</span>; }
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const heading = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby={heading} onCancel={event => { event.preventDefault(); onClose(); }}><div className="modal-heading"><h2 id={heading}>{title}</h2><Button variant="ghost" aria-label="Cerrar" onClick={onClose}><X size={20} /></Button></div>{children}</dialog>;
}
