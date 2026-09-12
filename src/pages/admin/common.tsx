import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, RefreshCw, Search } from 'lucide-react';
import { Button, Field, Input, Select } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { friendlyError } from '../../utils/errors';
import { todayLima } from '../../utils/date';
import { admin } from '../../services/admin';
import type { ReservationFilters } from '../../services/admin';

export const roleNames = { SUPER_ADMIN: 'Superadministrador', VENUE_ADMIN: 'Administrador de sede', RECEPTIONIST: 'Recepción' };
export const reservationNames: Record<string, string> = { CONFIRMED: 'Confirmada', CHECKED_IN: 'Check-in realizado', COMPLETED: 'Completada', CANCELLED: 'Cancelada', NO_SHOW: 'No asistió' };
export const laneNames: Record<string, string> = { AVAILABLE: 'Disponible', HELD: 'Bloqueo temporal', RESERVED: 'Reservado', CHECKED_IN: 'Check-in', MAINTENANCE: 'Mantenimiento' };
export const emptyFilters = (): ReservationFilters => ({ from: todayLima(), to: todayLima(), venue: '', pool: '', lane: '', search: '', status: '' });
export function offsetDate(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
export function dateTime(value: string) { return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(value)); }
export function usePermissions() {
  const { roles } = useAuth();
  const active = roles.filter(role => role.active);
  const superAdmin = active.some(role => role.role === 'SUPER_ADMIN');
  const manage = superAdmin || active.some(role => role.role === 'VENUE_ADMIN');
  return { superAdmin, manage, roles: active, canManage: (venueId: string) => superAdmin || active.some(role => role.role === 'VENUE_ADMIN' && role.venue_id === venueId) };
}
export function useAdminCatalog() {
  return useQuery({ queryKey: ['admin', 'catalog'], queryFn: async () => {
    const [venues, pools, lanes] = await Promise.all([admin.list('venues'), admin.list('pools'), admin.list('lanes')]);
    return { venues, pools, lanes };
  }, staleTime: 60_000 });
}
export function useRefreshAdmin() { const client = useQueryClient(); return () => client.invalidateQueries(); }
export function useDebounced<T>(value: T, delay = 350) { const [settled, setSettled] = useState(value); useEffect(() => { const timer = setTimeout(() => setSettled(value), delay); return () => clearTimeout(timer); }, [value, delay]); return settled; }

export function AdminHeading({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="admin-page-heading"><div><p className="kicker">{eyebrow || 'CENTRAL DE OPERACIONES'}</p><h1>{title}</h1><p className="muted">{description}</p></div>{actions && <div className="admin-heading-actions">{actions}</div>}</header>;
}
export function Notice({ error, success }: { error?: unknown; success?: string }) {
  if (error) return <div className="admin-notice error" role="alert"><AlertCircle size={18} /><span>{friendlyError(error)}</span></div>;
  if (success) return <div className="admin-notice success" role="status"><CheckCircle2 size={18} /><span>{success}</span></div>;
  return null;
}
export function QueryState({ pending, error, empty, onRetry, children, emptyText = 'No hay registros para mostrar.' }: { pending: boolean; error?: unknown; empty?: boolean; onRetry?: () => void; children: ReactNode; emptyText?: string }) {
  if (pending) return <div className="admin-loading" role="status" aria-label="Cargando información"><div className="admin-skeleton" /><div className="admin-skeleton" /><div className="admin-skeleton short" /><span className="muted">Consultando información…</span></div>;
  if (error) return <div className="admin-empty"><Notice error={error} />{onRetry && <Button variant="secondary" onClick={onRetry}><RefreshCw size={16} /> Reintentar</Button>}</div>;
  if (empty) return <div className="admin-empty"><Search size={28} /><h3>{emptyText}</h3><p className="muted">Ajusta los filtros o registra la primera entrada.</p></div>;
  return <>{children}</>;
}
export function ReservationFilterBar({ value, onChange, full = true }: { value: ReservationFilters; onChange: (next: ReservationFilters) => void; full?: boolean }) {
  const catalog = useAdminCatalog();
  const pools = catalog.data?.pools.filter(pool => !value.venue || pool.venue_id === value.venue) || [];
  const lanes = catalog.data?.lanes.filter(lane => value.pool && lane.pool_id === value.pool) || [];
  const update = (key: keyof ReservationFilters, next: string) => onChange({ ...value, [key]: next, ...(key === 'venue' ? { pool: '', lane: '' } : key === 'pool' ? { lane: '' } : {}) });
  return <div className="panel admin-filters"><div className="admin-filter-grid">
    <Field label="Desde"><Input type="date" value={value.from} max={value.to || undefined} onChange={event => update('from', event.target.value)} required /></Field>
    <Field label="Hasta"><Input type="date" value={value.to} min={value.from || undefined} onChange={event => update('to', event.target.value)} required /></Field>
    <Field label="Sede"><Select value={value.venue} onChange={event => update('venue', event.target.value)}><option value="">Todas mis sedes</option>{catalog.data?.venues.map(venue => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</Select></Field>
    <Field label="Piscina"><Select value={value.pool} onChange={event => update('pool', event.target.value)}><option value="">Todas las piscinas</option>{pools.map(pool => <option key={pool.id} value={pool.id}>{pool.name}</option>)}</Select></Field>
    {full && <><Field label="Estado"><Select value={value.status} onChange={event => update('status', event.target.value)}><option value="">Todos los estados</option>{Object.entries(reservationNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
      <Field label="Carril"><Select disabled={!value.pool} value={value.lane} onChange={event => update('lane', event.target.value)}><option value="">Todos los carriles</option>{lanes.map(lane => <option key={lane.id} value={lane.id}>Carril {lane.number}</option>)}</Select></Field></>}
  </div>{full && <Field label="Buscar reserva"><Input type="search" placeholder="Nombre, DNI, código, correo o teléfono" value={value.search} onChange={event => update('search', event.target.value)} /></Field>}<Notice error={catalog.error} /></div>;
}
export function Pagination({ page, count, size = 25, onChange, busy }: { page: number; count: number; size?: number; onChange: (page: number) => void; busy?: boolean }) {
  return <div className="admin-pagination"><span className="muted">{count ? `${page * size + 1}–${Math.min((page + 1) * size, count)} de ${count}` : '0 resultados'}</span><div className="row"><Button variant="secondary" disabled={page === 0 || busy} onClick={() => onChange(page - 1)}>Anterior</Button><Button variant="secondary" disabled={(page + 1) * size >= count || busy} onClick={() => onChange(page + 1)}>Siguiente</Button></div></div>;
}
