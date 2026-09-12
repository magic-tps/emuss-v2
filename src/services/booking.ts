import { rpc } from '../lib/supabase';
import type { Availability, BookingProfile, Catalog, Hold, Profile, Reservation } from '../types/domain';

export const bookingService = {
  catalog: () => rpc<Catalog>('get_catalog'),
  availability: (date: string, poolId?: string) => rpc<Availability[]>('get_availability', { p_date: date, p_pool_id: poolId || null }),
  profile: () => rpc<Profile | null>('my_profile'),
  holds: () => rpc<Hold[]>('my_holds'),
  acquire: (laneId: string, slotId: string) => rpc<Hold>('acquire_hold', { p_lane_id: laneId, p_time_slot_id: slotId }),
  release: (id: string) => rpc<null>('release_hold', { p_hold_id: id }),
  confirm: (id: string, profile: BookingProfile) => rpc<Reservation>('confirm_reservation', { p_hold_id: id, p_profile: { ...profile } }),
  reservations: () => rpc<Reservation[]>('my_reservations'),
  cancel: (id: string) => rpc<Reservation>('cancel_reservation', { p_reservation_id: id }),
  reschedule: (id: string, laneId: string, slotId: string) => rpc<Reservation>('reschedule_reservation', { p_reservation_id: id, p_lane_id: laneId, p_time_slot_id: slotId }),
};
