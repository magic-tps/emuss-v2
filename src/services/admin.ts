import { rpc, supabase } from '../lib/supabase';
import type { Availability, Catalog, Json, Lane, Pool, Reservation, ReservationPage, Role, Settings, UserRole, Venue } from '../types/domain';

export interface Schedule { id: string; pool_id: string; day_of_week: number; open_time: string; close_time: string; slot_minutes: number; price: number; active: boolean }
export interface Holiday { id: string; venue_id: string | null; date: string; reason: string }
export interface Maintenance { id: string; pool_id: string; lane_id: string | null; starts_at: string; ends_at: string; reason: string; pool_name: string; venue_name: string }
export interface Customer { id: string; first_name: string; last_name: string; email: string; dni_masked: string; reservations: number; attendances: number; cancellations: number; no_shows: number; last_reservation: string | null }
export interface Staff extends UserRole { first_name: string; last_name: string; email: string; venue_name: string | null }
export interface AuditEntry { id: string; admin_id: string; actor_name: string; action: string; entity_type: string; entity_id: string; metadata: Json; created_at: string }
export interface DayStats { date: string; reservations: number; check_ins: number; cancellations?: number; no_shows?: number }
export interface DashboardData {
  kpis: { today_reservations: number; occupancy: number; available_lanes: number; check_ins: number; cancellations: number; no_shows: number; new_users: number; future_reservations: number; returning_users: number };
  daily: DayStats[]; weekly: DayStats[]; monthly: DayStats[];
  venues: { name: string; reservations: number; occupancy: number; capacity: number }[];
  hours: { hour: string; reservations: number; capacity: number }[];
  lanes: { name: string; reservations: number }[];
}
export interface ReservationFilters { from: string; to: string; venue: string; pool: string; lane: string; status: string; search: string }
export type EditableEntity = 'venues' | 'pools' | 'lanes' | 'schedule_templates' | 'holidays' | 'settings';
interface EntityMap { venues: Venue; pools: Pool; lanes: Lane; schedule_templates: Schedule; holidays: Holiday; maintenance_blocks: Maintenance; user_roles: Staff; users: Customer; audit_logs: AuditEntry; settings: Settings & { id: number } }

export const admin = {
  list: <K extends keyof EntityMap>(entity: K) => rpc<EntityMap[K][]>('admin_list', { p_entity: entity }),
  save: (entity: EditableEntity, data: Record<string, Json>) => rpc('admin_save', { p_entity: entity, p_data: data }),
  remove: (entity: 'schedule_templates' | 'holidays', id: string) => rpc('admin_delete', { p_entity: entity, p_id: id }),
  catalog: () => rpc<Catalog>('get_catalog'),
  availability: (date: string, pool: string) => rpc<Availability[]>('get_availability', { p_date: date, p_pool_id: pool || null }),
  reservations: (filters: ReservationFilters, limit = 50, offset = 0, userId?: string) => rpc<ReservationPage>('admin_reservations', {
    p_from: filters.from, p_to: filters.to, p_venue_id: filters.venue || null, p_pool_id: filters.pool || null,
    p_lane_id: filters.lane || null, p_status: filters.status || null, p_search: filters.search,
    p_limit: limit, p_offset: offset, ...(userId ? { p_user_id: userId } : {}),
  }),
  dashboard: (from: string, to: string, venue: string, pool: string) => rpc<DashboardData>('admin_dashboard', { p_from: from, p_to: to, p_venue_id: venue || null, p_pool_id: pool || null }),
  lookup: (code: string) => rpc<Reservation>('lookup_reservation', { p_code: code }),
  checkIn: (code: string) => rpc<Reservation>('check_in_reservation', { p_code: code }),
  cancel: (id: string) => rpc<Reservation>('cancel_reservation', { p_reservation_id: id }),
  reschedule: (id: string, lane: string, slot: string) => rpc<Reservation>('reschedule_reservation', { p_reservation_id: id, p_lane_id: lane, p_time_slot_id: slot }),
  createReservation: (user: string, lane: string, slot: string) => rpc<Reservation>('admin_create_reservation', { p_user_id: user, p_lane_id: lane, p_time_slot_id: slot }),
  maintenance: (pool: string, lanes: string[] | null, startsAt: string, endsAt: string, reason: string) => rpc<Maintenance[]>('create_maintenance', { p_pool_id: pool, p_lane_ids: lanes, p_starts_at: startsAt, p_ends_at: endsAt, p_reason: reason }),
  removeMaintenance: (id: string) => rpc('remove_maintenance', { p_id: id }),
  generateSlots: (pool: string, from: string, to: string) => rpc<number>('generate_time_slots', { p_pool_id: pool, p_from: from, p_to: to }),
  staffRole: (user: string, role: Role, venue: string | null, active: boolean) => rpc<Staff>('set_staff_role', { p_user_id: user, p_role: role, p_venue_id: venue, p_active: active }),
  invite: async (data: { email: string; first_name: string; last_name: string; role: Role; venue_id: string | null }) => {
    const { data: result, error } = await supabase.functions.invoke('staff-invite', { body: data });
    if (error) {
      if ('context' in error && error.context instanceof Response) {
        const body: unknown = await error.context.json().catch(() => null);
        if (body && typeof body === 'object' && 'error' in body) throw new Error(String(body.error));
      }
      throw error;
    }
    if (result?.error) throw new Error(String(result.error));
    return result;
  },
};

// Prevent spreadsheet formula execution when staff exports untrusted customer text.
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (value: string | number | null | undefined) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
